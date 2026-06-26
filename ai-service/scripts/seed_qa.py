"""
Seed a per-industry pgvector knowledge base for the CallSphere Demo.

There are 8 industries, each with its OWN Postgres database
(`demo_healthcare`, `demo_real_estate`, ...). Every DB already has the
`vector` extension, schema `kb`, and table:

    kb.qa (id SERIAL PK, question TEXT, answer TEXT,
           embedding vector(1536), created_at)

For each industry this script connects to `demo_<slug>`, embeds the QUESTION
text of 20 basic Q&A pairs via OpenAI `text-embedding-3-small` (1536 dims),
and INSERTs them into `kb.qa`. It is idempotent: each industry's table is
TRUNCATEd (RESTART IDENTITY) inside a transaction before re-inserting, so
re-runs do not duplicate rows.

Config is sourced from `ai-service/.env`:
  - DATABASE_URL  (points at db `demo`; per-industry URLs swap the db name)
  - OPENAI_API_KEY

Run from the ai-service directory so package imports resolve:
    cd /home/ubuntu/apps/demo/ai-service
    ./venv/bin/python -m scripts.seed_qa
"""

import logging
import os
import re
import sys
import time
from typing import Dict, List, Tuple

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("seed_qa")

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536

# Ordered list of industry slugs; each maps to db `demo_<slug>`.
INDUSTRY_SLUGS = [
    "healthcare",
    "real_estate",
    "hospitality",
    "finance",
    "home_services",
    "automotive",
    "legal",
    "saas",
    "dental",
    "insurance",
    "logistics",
    "behavioral_health",
    "salon_spa",
]

# ---------------------------------------------------------------------------
# Q&A content: 20 brand-neutral, domain-appropriate pairs per industry.
# Answers are concise (1-3 sentences) and avoid giving regulated advice
# (no medical diagnosis, no specific investment advice, no legal advice).
# ---------------------------------------------------------------------------
QA_BY_INDUSTRY: Dict[str, List[Tuple[str, str]]] = {
    "healthcare": [
        ("What are your clinic hours?",
         "Our clinic is open Monday through Friday from 8:00 AM to 6:00 PM, and Saturday from 9:00 AM to 1:00 PM. We are closed on Sundays and major holidays."),
        ("How do I book an appointment?",
         "You can book an appointment by phone, through our patient portal, or right here in chat. I'll just need your name, date of birth, and the reason for your visit to get started."),
        ("Do you accept new patients?",
         "Yes, we are currently accepting new patients. New-patient visits are a little longer so we can review your full medical history, so please plan for some extra time."),
        ("What insurance plans do you accept?",
         "We accept most major insurance plans, including PPO and HMO options. I can check whether your specific plan is in-network if you tell me your insurer and plan name."),
        ("How do I cancel or reschedule my appointment?",
         "You can cancel or reschedule any time through the patient portal or by calling us. We ask for at least 24 hours' notice so we can offer the slot to another patient."),
        ("Do you offer telehealth or virtual visits?",
         "Yes, we offer secure video visits for many non-urgent concerns such as follow-ups, medication checks, and minor symptoms. I can help you book one if that suits you."),
        ("I'm not feeling well. Can you tell me what's wrong with me?",
         "I can't diagnose conditions or give medical advice, but I can help you book an appointment with a provider who can evaluate your symptoms properly. Would you like me to do that?"),
        ("What should I do in a medical emergency?",
         "If this is a life-threatening emergency, please hang up and call 911 or go to your nearest emergency room right away. I'm not able to provide emergency medical care."),
        ("How early should I arrive for my appointment?",
         "Please arrive about 15 minutes before your scheduled time so we can check you in and update any paperwork. New patients may want to arrive a bit earlier."),
        ("What do I need to bring to my visit?",
         "Please bring a photo ID, your insurance card, a list of current medications, and any relevant records or referrals. That helps us make your visit as smooth as possible."),
        ("Can I get a prescription refill?",
         "Refill requests are reviewed by your provider, usually within one to two business days. The fastest way is to request it through the patient portal or have your pharmacy send a request."),
        ("Do you have a pharmacy on site?",
         "We don't have an on-site pharmacy, but we can send your prescriptions electronically to the pharmacy of your choice. Just let your provider know which one you prefer."),
        ("How do I access my test results?",
         "Test results are posted to your secure patient portal once your provider has reviewed them. If you'd like, I can help you with portal access or password resets."),
        ("Do you offer same-day or walk-in appointments?",
         "We hold a limited number of same-day slots for urgent concerns, and availability changes throughout the day. I can check what's open right now if you'd like."),
        ("Is there a fee for missed appointments?",
         "A missed-appointment fee may apply if you don't cancel at least 24 hours in advance. We understand emergencies happen, so let us know and we'll do our best to help."),
        ("Do you treat children, or only adults?",
         "We see patients across many age groups; the exact range depends on the provider. Tell me the patient's age and I can match you with an appropriate provider."),
        ("How do I request a referral to a specialist?",
         "Your provider can issue a referral during or after your visit based on your needs. If you already have a visit booked, you can raise it then, or I can note the request for the team."),
        ("Where are you located and is there parking?",
         "I can share our exact address and directions, and yes, we have patient parking available on site. Let me know if you'd like the address sent to you."),
        ("Do you offer routine check-ups and preventive care?",
         "Yes, we offer annual physicals, wellness visits, and routine preventive screenings. These help catch issues early, and I can help you schedule one."),
        ("Is my health information kept private?",
         "Yes. We follow strict privacy and security practices to protect your health information, and we only share it as permitted by law or with your consent."),
    ],
    "real_estate": [
        ("How do I schedule a property showing?",
         "I can help you book a showing right now. Just tell me the property or area you're interested in and a few dates and times that work for you."),
        ("Do you help with both buying and selling?",
         "Yes, we work with both buyers and sellers, as well as renters. Let me know your goal and I'll connect you with the right agent."),
        ("How much is my home worth?",
         "Home value depends on location, condition, size, and recent comparable sales. We can prepare a complimentary market analysis; would you like to schedule one with an agent?"),
        ("What's the first step to buying a home?",
         "A great first step is getting pre-approved for a mortgage so you know your budget, then we can start touring homes that fit your criteria. I can connect you with an agent to begin."),
        ("How does mortgage pre-approval work?",
         "Pre-approval is when a lender reviews your finances and tells you how much you can likely borrow. It strengthens your offers; we can refer you to trusted lenders, but the lender handles the specifics."),
        ("How long does it take to close on a home?",
         "Closing typically takes around 30 to 45 days from an accepted offer, though it can vary with financing and inspections. Your agent will keep you updated at each step."),
        ("What are typical closing costs?",
         "Closing costs commonly run a few percent of the purchase price and cover items like loan fees, title, and taxes. Your lender and agent can provide an estimate tailored to your purchase."),
        ("Do you handle rentals as well?",
         "Yes, we help renters find homes and assist landlords with leasing. Tell me whether you're looking to rent or to list a rental and I'll point you in the right direction."),
        ("How much do I need for a down payment?",
         "Down payment requirements vary by loan type and can range widely; some programs allow lower amounts. A lender can tell you exactly what you'd qualify for."),
        ("What should I look for during a showing?",
         "Pay attention to the layout, natural light, condition of major systems, neighborhood, and commute. Jot down questions and your agent can follow up on anything unclear."),
        ("How do I make an offer on a property?",
         "Your agent will help you submit a written offer with a price and terms based on market conditions and comparable sales. We'll guide you through negotiation once it's submitted."),
        ("What is a home inspection and do I need one?",
         "A home inspection is a professional review of the property's condition before purchase. It's highly recommended so you understand any repairs needed; we can recommend inspectors."),
        ("Can you help me sell my home quickly?",
         "Yes. Pricing it well, strong photos, and good marketing make a big difference. An agent can walk you through a plan to attract qualified buyers; shall I set up a consultation?"),
        ("What documents do I need to sell my home?",
         "You'll typically need your deed, recent tax and utility info, mortgage details, and any warranties or HOA documents. Your agent will give you a complete checklist."),
        ("Are there homes available in a specific neighborhood?",
         "I can check current listings for a neighborhood you have in mind. Tell me the area, your budget, and the number of bedrooms you'd like."),
        ("How do you determine the listing price?",
         "We look at recent comparable sales, current market trends, and your home's condition and features to recommend a competitive price. Your agent will review the analysis with you."),
        ("What is earnest money?",
         "Earnest money is a good-faith deposit you put down with an offer to show you're serious. It's typically applied toward your purchase at closing; your agent will explain the specifics."),
        ("Do I need a real estate agent to buy a home?",
         "You're not required to, but an agent helps with pricing, negotiation, paperwork, and avoiding costly mistakes, often at no direct cost to the buyer. I'm happy to connect you with one."),
        ("Can I tour homes virtually?",
         "Yes, many of our listings offer virtual tours or video walkthroughs. Let me know which properties interest you and I'll share what's available."),
        ("What ongoing costs come with owning a home?",
         "Beyond the mortgage, plan for property taxes, insurance, maintenance, and possibly HOA fees. An agent can help you estimate these for any home you're considering."),
    ],
    "hospitality": [
        ("How do I make a reservation?",
         "I'd be happy to help. For a room, tell me your check-in and check-out dates and number of guests; for a table, let me know your party size, date, and time."),
        ("What are your check-in and check-out times?",
         "Check-in begins at 3:00 PM and check-out is by 11:00 AM. If you need early check-in or late check-out, let me know and I'll check availability."),
        ("Do you offer free Wi-Fi?",
         "Yes, complimentary high-speed Wi-Fi is available throughout the property for all guests. We can send login details at check-in."),
        ("Is parking available?",
         "Yes, we offer guest parking. I can share details on availability and any applicable fees, and let you know about valet options if you'd like."),
        ("Do you allow pets?",
         "We welcome pets in designated rooms with a small cleaning fee and some size guidelines. Let me know your pet's details and I'll confirm availability."),
        ("What time is breakfast served?",
         "Breakfast is served daily from 7:00 AM to 10:00 AM, with a weekend brunch a bit later. I can share the menu or note any dietary needs you have."),
        ("Do you have amenities like a pool or gym?",
         "Yes, we offer a fitness center and pool for guests, along with other amenities. I can tell you the hours and any access details you'll need."),
        ("What is your cancellation policy?",
         "Most reservations can be cancelled free of charge up to 24 to 48 hours before arrival, depending on the rate. I can confirm the exact policy for your booking."),
        ("Can I request a late check-out?",
         "Late check-out is often available depending on occupancy, sometimes for a small fee. Let me know your preferred time and I'll check what we can do."),
        ("Do you accommodate dietary restrictions or allergies?",
         "Absolutely. Please share any allergies or dietary needs and we'll do our best to accommodate them in our restaurant and room service."),
        ("Is room service available?",
         "Yes, room service is available during set hours each day. I can share the menu and the hours so you can plan accordingly."),
        ("How far are you from the airport?",
         "I can give you the distance and approximate travel time, and let you know about shuttle, rideshare, and public transit options. Where are you arriving from?"),
        ("Can I book a table for a large group?",
         "Yes, we accommodate larger parties and can often arrange a special area or set menu. Tell me your group size and date and I'll check availability."),
        ("Do you offer airport shuttle or transportation?",
         "We can let you know about shuttle service and nearby transportation options. Share your arrival details and I'll provide the relevant information."),
        ("What payment methods do you accept?",
         "We accept major credit and debit cards, and a card is typically required to hold a reservation. Let me know if you have a specific method in mind."),
        ("Do you have rooms suitable for families?",
         "Yes, we offer family-friendly rooms and can arrange extra bedding or connecting rooms when available. Tell me your party size and I'll find a good fit."),
        ("Is there a minimum age to check in?",
         "Guests typically need to be at least 18 and present a valid photo ID and payment card at check-in. I can confirm the exact policy for your stay."),
        ("Can I add special requests to my reservation?",
         "Of course. Whether it's a quiet room, a particular bed type, or a celebration, just tell me your requests and I'll add them to your booking."),
        ("Do you host events or private dining?",
         "Yes, we offer spaces for events and private dining for various group sizes. Share your date and guest count and I'll connect you with our events team."),
        ("What is included in the room rate?",
         "Room rates generally include Wi-Fi and use of standard amenities; some packages include breakfast or parking. I can confirm exactly what's included for the rate you choose."),
    ],
    "finance": [
        ("How do I open a new account?",
         "Opening an account is quick. I can help you get started, or connect you with a banker; you'll typically need a photo ID and some basic personal information."),
        ("What types of accounts do you offer?",
         "We offer checking, savings, and certificate accounts, among others. Tell me what you're trying to accomplish and I'll point you to options that may fit."),
        ("What are your current interest rates?",
         "Rates vary by account and term and can change frequently. I can share today's posted rates for a specific product if you tell me which one you're interested in."),
        ("How do I apply for a loan?",
         "You can start a loan application online, in branch, or with a loan officer. We'll review your details and let you know the documents needed for the type of loan you want."),
        ("What do I need to qualify for a loan?",
         "Lenders generally look at income, credit history, existing debt, and the loan purpose. The exact requirements depend on the loan, and a loan officer can review your situation."),
        ("Can you help me decide how to invest my money?",
         "I can't give specific investment advice, but I can book you a meeting with a licensed financial advisor who can review your goals and discuss suitable options."),
        ("How do I book an appointment with a financial advisor?",
         "I'd be glad to schedule that. Let me know a few dates and times that work for you, and whether you'd prefer to meet in person, by phone, or by video."),
        ("What are the fees for my account?",
         "Fees depend on the account type and can include monthly maintenance or transaction fees, many of which can be waived. I can pull up the fee schedule for a specific account."),
        ("How do I reset my online banking password?",
         "You can reset it using the 'Forgot Password' link on the login page, which verifies your identity securely. If you get stuck, I can guide you or connect you to support."),
        ("Is my money safe with you?",
         "We use strong security measures to protect your accounts, and eligible deposits are insured up to applicable limits. I can explain how that coverage works for your accounts."),
        ("How do I report a lost or stolen card?",
         "Please let us know right away so we can freeze the card and prevent unauthorized charges. I can start that process now or connect you to our card services team."),
        ("What's the difference between a fixed and variable rate?",
         "A fixed rate stays the same over the term, while a variable rate can change with the market. The best choice depends on your goals, and an advisor can walk you through it."),
        ("How long does a loan approval take?",
         "Timelines vary by loan type; some decisions are quick, while mortgages can take longer due to documentation and underwriting. Your loan officer will give you an estimate."),
        ("Can I refinance an existing loan?",
         "Refinancing may help if rates or your situation have changed. A loan officer can review your current loan and goals to see whether it makes sense for you."),
        ("Do you offer mobile and online banking?",
         "Yes, you can bank online and through our mobile app to check balances, transfer funds, pay bills, and deposit checks. I can help you get set up if you'd like."),
        ("What information do I need to open an account?",
         "You'll typically need a government-issued photo ID, your Social Security or tax ID number, and basic contact details. A small opening deposit may also be required."),
        ("How do I set up direct deposit?",
         "You'll provide your employer with your account and routing numbers, which I can help you locate. Many employers offer a simple form to complete."),
        ("What credit score do I need for a loan?",
         "There isn't a single number; lenders consider your full financial picture along with the loan type. A loan officer can review your profile and explain your options."),
        ("Can I apply for a loan online?",
         "Yes, you can begin many loan applications online and finish with a loan officer if needed. Tell me the type of loan and I'll point you to the right starting place."),
        ("How do I dispute a charge on my account?",
         "If you see a charge you don't recognize, let us know promptly and we'll help you start a dispute and investigate. I can connect you with the right team to begin."),
    ],
    "home_services": [
        ("How do I get a quote for a job?",
         "I can help you request a quote. Just tell me the service you need, a brief description of the issue, and your address, and we'll arrange an estimate."),
        ("Do you offer free estimates?",
         "Yes, we provide free estimates for most projects. For larger or diagnostic jobs there may be a small visit fee that's often credited toward the work."),
        ("What are your service hours?",
         "We schedule standard service Monday through Saturday during business hours, and we offer emergency service outside those times for urgent issues."),
        ("Do you handle emergency calls?",
         "Yes, we offer emergency service for urgent issues like major leaks, no heat, or electrical hazards. Tell me what's happening and I'll prioritize getting someone out to you."),
        ("How soon can someone come out?",
         "Availability depends on your area and the type of job, but we often have same-day or next-day slots. Share your location and I'll check the earliest opening."),
        ("What services do you provide?",
         "We handle HVAC, plumbing, and electrical work, including repairs, installations, and maintenance. Tell me what you need and I'll confirm we cover it."),
        ("Are your technicians licensed and insured?",
         "Yes, our technicians are licensed and insured, and we stand behind our work. I'm happy to share more about our credentials and guarantees."),
        ("How much does a typical repair cost?",
         "Cost depends on the issue, parts, and labor involved, so we provide an estimate before any work begins. Describe the problem and we'll get you a quote."),
        ("Do you offer maintenance plans?",
         "Yes, we offer maintenance plans that include regular tune-ups and priority scheduling, which help prevent breakdowns. I can explain the options if you're interested."),
        ("My AC isn't working. Can you help?",
         "I'm sorry to hear that. I can get a technician scheduled to diagnose and fix it. Can you tell me what you're noticing, such as no cooling, strange noises, or no power?"),
        ("I have a plumbing leak. What should I do?",
         "If it's significant, turn off the water supply to that area or the main shutoff if needed, then we'll get a plumber out quickly. I can book an urgent visit right now."),
        ("Do you provide a warranty on your work?",
         "Yes, our work and many parts come with a warranty. The exact coverage depends on the job, and we'll spell it out clearly on your estimate and invoice."),
        ("How do I schedule a service appointment?",
         "I can set that up for you. Tell me the service you need, your address, and a few times that work, and I'll find an available slot."),
        ("Can you install new appliances or fixtures?",
         "Yes, we install a range of appliances, fixtures, and systems. Let me know what you'd like installed and we'll arrange an estimate and scheduling."),
        ("What payment methods do you accept?",
         "We accept major credit cards and other common payment methods, and financing may be available for larger projects. I can share the details for your job."),
        ("Do you offer financing for larger projects?",
         "Yes, financing options may be available for bigger installations or replacements. I can connect you with someone who can review the options with you."),
        ("Will you give me an estimate before starting work?",
         "Always. We provide a clear estimate and get your approval before beginning any work, so there are no surprises on your bill."),
        ("How do I prepare for my service appointment?",
         "Please clear access to the work area and secure any pets, and have details about the issue handy. The technician will take care of the rest."),
        ("Do you service my area?",
         "We cover many neighborhoods, and I can confirm right away. Just share your ZIP code or address and I'll check whether you're in our service area."),
        ("Can I reschedule my appointment?",
         "Of course. Let me know your current appointment and a new time that works, and I'll update it for you as soon as possible."),
    ],
    "automotive": [
        ("How do I book a service appointment?",
         "I'd be glad to help. Tell me your vehicle's year, make, and model, the service you need, and a few times that work, and I'll find an available slot."),
        ("What are your service department hours?",
         "Our service department is open Monday through Friday from 7:30 AM to 6:00 PM and Saturday mornings. I can confirm availability for the day you have in mind."),
        ("Do you have a specific vehicle in stock?",
         "I can check our current inventory for you. Tell me the make, model, year, and any features you'd like, and I'll see what's available."),
        ("Do you offer financing?",
         "Yes, we offer financing through several lenders to fit a range of budgets. We can help you get pre-qualified so you know your options before you shop."),
        ("How does a trade-in work?",
         "We'll appraise your current vehicle and apply its value toward your next purchase, which can lower your price and taxes in some cases. I can set up an appraisal for you."),
        ("How much is my trade-in worth?",
         "Trade-in value depends on the year, mileage, condition, and current demand. The most accurate way is a quick appraisal; I can schedule one or get you a preliminary estimate."),
        ("Do I need an appointment for an oil change?",
         "An appointment is recommended to minimize your wait, though we do accept some walk-ins. I can book you a convenient time right now."),
        ("How long does a typical service take?",
         "Routine services like an oil change are usually quick, while larger repairs take longer. We'll give you a time estimate when you check in and keep you updated."),
        ("Do you offer loaner cars or shuttle service?",
         "Depending on the service and availability, we may offer a loaner vehicle or shuttle. Let me know your appointment details and I'll check what's available."),
        ("What's included in routine maintenance?",
         "Routine maintenance typically includes oil and filter changes, fluid checks, tire rotation, and inspections per your vehicle's schedule. I can confirm what's due for your car."),
        ("Can I get a price estimate for a repair?",
         "Yes. If you describe the issue or share any warning lights, we can provide an estimate after a quick diagnosis, and we'll get your approval before any work."),
        ("Do you service vehicles you didn't sell?",
         "Absolutely. Our service department welcomes all makes and models, whether or not you purchased the vehicle from us."),
        ("What warranties come with a purchase?",
         "Warranty coverage depends on the vehicle and whether it's new or pre-owned, and extended options are available. We'll review the specifics for any vehicle you're considering."),
        ("Can I schedule a test drive?",
         "Yes, I can arrange a test drive. Let me know which vehicle you're interested in and a time that works, and I'll set it up."),
        ("Do you sell used or certified pre-owned vehicles?",
         "Yes, we carry both used and certified pre-owned vehicles that go through inspections. Tell me your budget and preferences and I'll show you what fits."),
        ("My check engine light is on. What should I do?",
         "It's best to have it checked soon, since causes range from minor to serious. I can book a diagnostic appointment so a technician can read the codes and advise you."),
        ("Do you offer tire services?",
         "Yes, we handle tire rotation, balancing, repair, and replacement. Tell me your vehicle and what you need and I'll schedule it for you."),
        ("What payment methods do you accept for service?",
         "We accept major credit and debit cards and other common methods, and financing may be available for larger repairs. I can share the details for your visit."),
        ("How often should I service my vehicle?",
         "Service intervals depend on your make, model, and driving habits, and your owner's manual has the recommended schedule. I can check what's due based on your mileage."),
        ("Can I get a vehicle history report?",
         "Yes, we can provide a vehicle history report for our pre-owned vehicles so you can buy with confidence. Let me know which one you're interested in."),
    ],
    "legal": [
        ("How do I schedule a consultation?",
         "I can help you set up a consultation. Let me know the general nature of your matter and a few times that work, and I'll arrange it with the right attorney."),
        ("What practice areas do you handle?",
         "Our firm handles several practice areas. Tell me briefly what your matter involves and I'll confirm whether we can help or refer you appropriately."),
        ("Do you offer free initial consultations?",
         "Many matters qualify for a free or low-cost initial consultation. I can confirm the details for your type of case and get you scheduled."),
        ("Can you give me legal advice about my situation?",
         "I can't provide legal advice, but I can gather some basic information and book a consultation with an attorney who can advise you properly. Would you like to do that?"),
        ("What information do you need for intake?",
         "For intake we usually collect your name, contact details, a brief description of your matter, and any deadlines involved. Sharing this helps us prepare for your consultation."),
        ("How much do your services cost?",
         "Fees depend on the type of matter and the work involved; some are flat-fee, hourly, or contingency-based. The attorney will explain the structure during your consultation."),
        ("What should I bring to my consultation?",
         "Please bring any documents related to your matter, such as contracts, letters, notices, or court papers, plus a list of questions. That helps the attorney assess your situation."),
        ("How long do I have to file a claim?",
         "Deadlines vary widely by matter and jurisdiction, and missing one can affect your rights, so it's important to speak with an attorney promptly. I can help you book a consultation."),
        ("Is my information kept confidential?",
         "Yes, we treat your information with strict confidentiality. Sharing details with us during intake is handled carefully and privately."),
        ("Do you handle cases in my area or jurisdiction?",
         "I can check that for you. Tell me the location involved in your matter and the type of issue, and I'll confirm whether we can assist."),
        ("How do I become a client?",
         "Typically you'd have a consultation, and if we're a good fit, you'll sign an engagement agreement that outlines the scope and fees. I can start by booking your consultation."),
        ("Can I speak with an attorney directly?",
         "Yes. I'll gather a few details first, then schedule time for you to speak with an attorney who handles your type of matter."),
        ("How long will my case take?",
         "Timelines depend heavily on the type of matter and circumstances, so an attorney can give you a realistic estimate after reviewing the details during your consultation."),
        ("Do you offer payment plans?",
         "Payment arrangements may be available depending on the matter. The attorney or our billing team can discuss options with you during or after your consultation."),
        ("What happens during the first meeting?",
         "In the first meeting, the attorney listens to your situation, asks questions, explains possible options, and discusses fees. You're not committed to anything by attending."),
        ("Can you help me with documents or contracts?",
         "We assist with reviewing and preparing various documents and contracts. Tell me what you're working on and I'll arrange the right attorney to help."),
        ("Do I have a valid case?",
         "I'm not able to evaluate the merits of a case, but an attorney can review the facts and advise you. Let me schedule a consultation so you can get a professional assessment."),
        ("How do I prepare for my legal matter?",
         "Gathering relevant documents, noting key dates, and writing down your questions are great first steps. The attorney will guide you on anything specific to your situation."),
        ("Do you handle both individuals and businesses?",
         "Yes, we assist individuals as well as businesses, depending on the practice area. Let me know who you're representing and the matter, and I'll connect you appropriately."),
        ("How can I reach the firm if I have questions?",
         "You can reach us by phone, email, or through this chat during business hours. I can also take a message and have the right person follow up with you."),
    ],
    "saas": [
        ("How do I request a demo?",
         "I'd be happy to set up a demo. Tell me a bit about your company and what you're hoping to solve, and a few times that work, and I'll arrange it with our team."),
        ("What pricing plans do you offer?",
         "We offer tiered plans designed for different team sizes and needs, typically including a starter, professional, and enterprise tier. I can walk you through what fits your use case."),
        ("Is there a free trial?",
         "Yes, we offer a free trial so you can explore the product before committing. I can help you get started and point you to the key features to try first."),
        ("How does onboarding work?",
         "After sign-up, we guide you through setup with onboarding resources and, on some plans, a dedicated specialist. Most teams are up and running quickly."),
        ("Do you offer a free tier?",
         "We offer a free trial and, depending on the product, a limited free plan. Tell me your needs and I'll let you know which option makes the most sense."),
        ("How do I contact support?",
         "You can reach support through in-app chat, email, or our help center, and priority support is available on higher tiers. I can also log an issue for you right now."),
        ("What integrations do you support?",
         "We integrate with many popular tools, and we offer an API for custom workflows. Tell me which tools you use and I'll confirm whether we connect with them."),
        ("Is my data secure?",
         "Yes, we follow industry-standard security practices, including encryption and access controls, to protect your data. I can share more detail or relevant documentation if helpful."),
        ("Can I upgrade or downgrade my plan later?",
         "Absolutely. You can change your plan as your needs evolve, and changes typically take effect at your next billing cycle. I can explain how it works for your account."),
        ("Do you offer discounts for annual billing?",
         "Yes, annual billing usually comes with a discount compared to monthly. I can show you the savings for the plan you're considering."),
        ("How many users can I add?",
         "User limits depend on your plan, and you can add seats as your team grows. Tell me your team size and I'll recommend a plan that fits."),
        ("What kind of customer support is included?",
         "All plans include core support, with faster response times and dedicated contacts on higher tiers. I can detail what's included with the plan you have in mind."),
        ("Can I migrate my existing data into your platform?",
         "Yes, we support importing data and can assist with migration, especially on higher tiers. Let me know what you're migrating from and I'll outline the process."),
        ("Do you have an API or developer documentation?",
         "Yes, we offer a documented API and developer resources so you can build custom integrations. I can point you to the docs and a quick-start guide."),
        ("How do I cancel my subscription?",
         "You can cancel from your account billing settings, and your plan remains active until the end of the current period. I'm happy to walk you through it."),
        ("Do you offer onboarding or training sessions?",
         "Yes, we provide onboarding resources and, on certain plans, live training sessions to help your team get the most out of the product. I can help you book one."),
        ("What happens to my data if I cancel?",
         "You can typically export your data before canceling, and we retain it for a limited period per our policy in case you return. I can share the specifics for your account."),
        ("Is there a setup or implementation fee?",
         "Most plans have no setup fee, while larger enterprise rollouts may include implementation support. I can confirm what applies to the plan you're considering."),
        ("Can I get a custom plan for my enterprise?",
         "Yes, we offer enterprise plans with custom terms, security reviews, and dedicated support. I can connect you with our team to scope the right package."),
        ("How do I add or remove team members?",
         "You can manage team members from your account settings, adding or removing seats as needed. I can guide you through it or help your admin get set up."),
    ],
    "dental": [
        ("What are your office hours?",
         "We're open Monday through Friday from 8:00 AM to 5:00 PM, with some Saturday morning hours for cleanings. I can check the next available slot for you right now if you'd like."),
        ("How do I book a dental appointment?",
         "I can book it for you right here. I'll just need your name, a phone number, and whether this is a cleaning, a check-up, or a specific concern so I can reserve the right amount of time."),
        ("Are you accepting new patients?",
         "Yes, we're welcoming new patients. New-patient visits include a full exam and any needed X-rays, so they run a little longer, and I can get you scheduled today."),
        ("Do you take my dental insurance?",
         "We accept most major dental plans, including PPO coverage. Tell me your insurer and plan name and I can note it on your file and have the team verify your benefits before the visit."),
        ("How do I cancel or reschedule?",
         "You can cancel or reschedule any time through me or by calling the office. We just ask for at least 24 hours' notice so we can offer the slot to someone else, and I'll send you a confirmation either way."),
        ("I have a really bad toothache, what should I do?",
         "I'm sorry you're in pain. I can prioritize you for an emergency dental slot today. If you have severe facial swelling, trouble breathing, or uncontrolled bleeding, please call 911 or go to the ER right away."),
        ("How often should I get a cleaning?",
         "For most patients we recommend a cleaning and check-up every six months, though your dentist may suggest a different interval based on your needs. I can set up a recurring reminder so you never miss one."),
        ("What should I bring to my first visit?",
         "Please bring a photo ID, your insurance card, and a list of any medications you take. If you have recent dental X-rays from another office, those help too, and I can send you a new-patient form ahead of time."),
        ("How much does a visit cost?",
         "Costs depend on the treatment and your insurance, but I can share typical pricing for cleanings, exams, and X-rays, and the team can give you a full estimate before any work begins. We also offer payment plans."),
        ("Will the procedure hurt? Do you offer sedation?",
         "We focus on keeping you comfortable and offer numbing and sedation options for anxious patients or longer procedures. Let me note that you'd like to discuss sedation so the team is ready for you."),
        ("Do you see children?",
         "Yes, we see children and many families book back-to-back visits. Tell me the patient's age and I'll match you with the right provider and schedule enough time."),
        ("Do you offer teeth whitening or veneers?",
         "Yes, we offer cosmetic services including professional whitening and veneers. I can book a cosmetic consultation where the dentist reviews your goals and gives you a personalized plan and quote."),
        ("How early should I arrive?",
         "Please arrive about 10 to 15 minutes early so we can check you in and update your paperwork. New patients may want a few extra minutes for forms, which I can email you in advance."),
        ("Can you transfer my records or X-rays from another dentist?",
         "Yes, we can request your records and recent X-rays from your previous office with your permission. I can start that request now so everything's ready for your appointment."),
        ("Is there a fee if I miss my appointment?",
         "A missed-appointment fee may apply if you don't give at least 24 hours' notice. We send reminders by text and call to help you avoid it, and life happens, so just let us know."),
        ("Do you take walk-ins or same-day appointments?",
         "We keep a few same-day slots open for urgent issues like pain or a broken tooth. I can check what's available right now and get you in as soon as possible."),
        ("Do you offer financing or a membership plan?",
         "Yes, we offer financing for larger treatments and an in-house membership plan for patients without insurance. I can connect you with the team to review which option fits your budget."),
        ("What's the difference between a regular and a deep cleaning?",
         "A regular cleaning maintains healthy gums, while a deep cleaning treats below the gumline when there are signs of gum disease. Your dentist decides which you need after an exam, and I can book that exam for you."),
        ("Can you tell me if I have a cavity over the phone?",
         "I'm not able to diagnose dental problems without an exam, but I can book you with a dentist who can take a proper look and X-rays. Would you like me to schedule that?"),
        ("Where are you located and is there parking?",
         "I can text you our address and directions, and yes, we have patient parking on site. Let me know and I'll send it over along with your appointment details."),
    ],
    "insurance": [
        ("What are your office hours?",
         "Our agents are available Monday through Friday from 8:00 AM to 6:00 PM, and our claims line is staffed 24/7 for emergencies. I can answer many questions right now or set up a callback."),
        ("Can I get a quote?",
         "Absolutely. I can start a quote for you right now. Tell me the type of coverage you're interested in and a few basic details, and I'll capture everything so a licensed agent can finalize your rate."),
        ("What types of insurance do you offer?",
         "We offer auto, home, renters, life, and business coverage, and we can often bundle them for a discount. Let me know what you're looking to protect and I'll point you to the right option."),
        ("How do I file a claim?",
         "I can start your claim right now. I'll need your policy number, the date and a brief description of what happened, and the best number to reach you, then our claims team will follow up promptly."),
        ("How do I check the status of my claim?",
         "I can look that up if you give me your claim or policy number. I'll tell you where it stands and, if you'd like, connect you with your adjuster for the details."),
        ("How do I add a driver or vehicle to my policy?",
         "I can capture the new driver or vehicle details and route the change to your agent to update the policy and adjust your premium. Mid-term changes usually take effect quickly once confirmed."),
        ("How do I cancel my policy?",
         "I can start a cancellation request and have an agent confirm the effective date and any refund. Before you cancel, I'm happy to have someone review options that might lower your cost instead."),
        ("How do I make a payment or set up billing?",
         "You can pay by phone, online, or set up automatic payments. I can take a payment now or send you a secure link, and I can also set up autopay so you never miss a due date."),
        ("I need proof of insurance or my ID card.",
         "I can email or text your insurance ID card and a proof-of-coverage document right away. Just confirm the policy and the best place to send it."),
        ("Do you offer any discounts?",
         "Yes, we offer discounts for bundling policies, safe driving, security systems, and paying in full, among others. I can note your situation so your agent applies every discount you qualify for."),
        ("What does 'deductible' mean?",
         "Your deductible is the amount you pay out of pocket on a covered claim before your insurance pays the rest. A higher deductible usually lowers your premium, and an agent can help you pick the right balance."),
        ("What does my policy actually cover?",
         "Coverage depends on your specific policy, so I'll pull up the details or connect you with your agent to walk through exactly what's included and any limits. I can also email you a summary."),
        ("My policy lapsed, can I reinstate it?",
         "In many cases we can reinstate a lapsed policy or set up a new one quickly. Let me capture your details and have a licensed agent review your reinstatement options right away."),
        ("I had an accident and need help right now.",
         "I'm glad you're reaching out. If anyone is injured or in danger, please call 911 first. Once everyone is safe, I can start your claim immediately and arrange roadside assistance or a tow if your policy includes it."),
        ("Can I speak to a licensed agent?",
         "Of course. I can connect you with a licensed agent now or schedule a callback at a time that works for you. I'll pass along everything you've told me so you don't have to repeat yourself."),
        ("When does my policy renew?",
         "I can check your renewal date and upcoming premium if you give me your policy number. I can also set a reminder before renewal so there are no surprises."),
        ("How can I lower my premium?",
         "There are several ways, such as bundling, raising your deductible, or adding safety features. I'll capture your details so an agent can run the numbers and recommend the best savings for you."),
        ("How do I upload documents for my claim?",
         "I can send you a secure link to upload photos and documents, or note that your adjuster should follow up to collect them. Either way I'll make sure they reach the right file."),
        ("Which specific coverage should I buy?",
         "I can explain how each option works, but the right amount of coverage depends on your situation, so a licensed agent will give you a personalized recommendation. I can set that up and capture your needs now."),
        ("Where is your office located?",
         "I can share our office address and hours, and most things, including quotes and claims, we can handle right over the phone or online. Would you like me to text you the location?"),
    ],
    "logistics": [
        ("What are your hours of operation?",
         "Our dispatch and customer service teams are available Monday through Friday from 7:00 AM to 7:00 PM, and tracking and after-hours support are available around the clock. How can I help with your shipment?"),
        ("How do I track my shipment?",
         "I can look that up right now. Share your tracking or reference number and I'll tell you the current status, location, and estimated delivery time."),
        ("Can I get a freight quote?",
         "Yes, I can start a quote. Tell me the pickup and delivery locations, the approximate weight and dimensions, and whether it's parcel, LTL, or full truckload, and I'll capture it for our team to price."),
        ("How do I schedule a pickup?",
         "I can schedule that for you. I'll need the pickup address, the ready time, and the number and size of items, then I'll book a window and send you a confirmation."),
        ("When will my delivery arrive?",
         "I can give you an estimated delivery time based on your tracking number and the service level. If timing is tight, I can flag it for dispatch and look at expedited options."),
        ("What shipping services do you offer?",
         "We handle parcel, less-than-truckload, full truckload, and expedited freight, plus warehousing and last-mile delivery. Tell me what you're moving and I'll recommend the right service."),
        ("My shipment is delayed, what's going on?",
         "I'm sorry for the delay. Let me check the tracking and the latest dispatch notes, then I can give you an updated ETA and, if needed, escalate it to the team handling your lane."),
        ("My shipment was damaged or lost, how do I file a claim?",
         "I can start a claim right now. I'll need your tracking number, a description of the damage or loss, and any photos, then our claims team will follow up with next steps."),
        ("Do you ship internationally and handle customs?",
         "Yes, we offer international freight and can assist with customs documentation. Tell me the origin, destination, and contents and I'll capture the details so our team can quote and advise on requirements."),
        ("Are there weight or size limits?",
         "Limits depend on the service and equipment, but we handle everything from small parcels to oversized freight. Give me the dimensions and weight and I'll confirm the best option for your shipment."),
        ("Can you ship hazardous materials?",
         "We can move certain hazmat shipments with the proper documentation and certified carriers. Let me capture the material type and details so our specialized team can confirm requirements and pricing."),
        ("Can I get proof of delivery?",
         "Yes, I can send you a proof-of-delivery document, including the signature and timestamp, once the shipment is delivered. Just give me the tracking number and where to send it."),
        ("I need to change the delivery address.",
         "I can submit a delivery change request and route it to dispatch. Changes are usually possible before the final delivery run, and I'll confirm whether it affects timing or cost."),
        ("How do I get an invoice or check my account?",
         "I can pull up your recent invoices and account balance, or connect you with billing for a detailed breakdown. I can also email a copy of any invoice you need."),
        ("Do you offer expedited or same-day shipping?",
         "Yes, we offer expedited and same-day options on many lanes. Tell me the pickup, destination, and deadline and I'll capture it so dispatch can confirm availability and price quickly."),
        ("Do you offer warehousing or storage?",
         "Yes, we offer short- and long-term warehousing, plus fulfillment and cross-docking. Let me know your volume and how long you need storage and I'll connect you with the right team."),
        ("Can I speak to dispatch about an urgent load?",
         "Absolutely. I can flag this as urgent and connect you with dispatch right away, and I'll pass along your shipment details so they can act immediately."),
        ("How should I package my shipment?",
         "Good packaging protects your freight, so we recommend sturdy boxes or proper palletizing, secure strapping, and clear labels. I can send you our packaging guidelines for your shipment type."),
        ("Who is liable if my freight is damaged?",
         "Liability depends on the service, declared value, and carrier terms, so I won't guess on the specifics, but I can start a claim and connect you with the team that handles coverage details."),
        ("Where is your nearest terminal or facility?",
         "I can find the closest terminal to your pickup or delivery point and share the address and hours. Tell me the city or ZIP code and I'll look it up."),
    ],
    "behavioral_health": [
        ("If this is an emergency or you're in crisis, what should I do?",
         "If you're in immediate danger or thinking about harming yourself, please call or text 988 for the Suicide and Crisis Lifeline, or call 911 right now. You deserve support immediately, and these lines are staffed 24/7."),
        ("What are your hours?",
         "Our office is open Monday through Friday from 8:00 AM to 7:00 PM, with some evening and weekend telehealth availability. I can help you find a time that fits your schedule."),
        ("How do I book a first appointment?",
         "I can get you started right now. I'll take your name, contact information, and a little about what you're looking for, then match you with an available therapist and book your intake session."),
        ("Are you accepting new clients?",
         "Yes, we're accepting new clients. Depending on the specialty there may be a short wait, and I can either book the first opening or add you to a priority waitlist and notify you when a sooner slot opens."),
        ("Do you take insurance, or offer sliding-scale fees?",
         "We accept many insurance plans and also offer sliding-scale fees for those who qualify. Tell me your insurer or your situation and I'll note it so we can confirm your options before the first session."),
        ("How do I cancel or reschedule a session?",
         "You can reschedule or cancel through me or by calling the office. We ask for at least 24 hours' notice so we can offer the time to someone else, and I'll send you a reminder beforehand."),
        ("Do you offer virtual or telehealth sessions?",
         "Yes, we offer secure video sessions as well as in-person visits. Many clients find telehealth more convenient, and I can book whichever you prefer and send you a private link."),
        ("What kinds of therapy or specialties do you offer?",
         "Our clinicians support areas like anxiety, depression, stress, relationships, trauma, and more, using approaches such as talk therapy and CBT. Tell me what's on your mind and I'll match you to the right fit."),
        ("Is what I share kept private?",
         "Yes, your privacy matters and sessions are confidential, protected by law, with only limited exceptions for safety. Your therapist will go over confidentiality with you at the first visit."),
        ("What happens in the first session?",
         "The first session is an intake where your therapist gets to know you, talks through what brought you in, and works with you on goals. It's a relaxed conversation, and there's nothing you need to prepare."),
        ("How much does a session cost?",
         "Costs vary by service and insurance, and I can share our typical self-pay rates and sliding-scale options. The team will confirm your exact cost before your first session so there are no surprises."),
        ("Can you tell me what's wrong with me or give a diagnosis?",
         "I'm not able to diagnose or give clinical advice, but a licensed therapist can properly understand what you're going through and support you. I can book that appointment for you now."),
        ("Do you prescribe medication or have a psychiatrist?",
         "Our therapists provide counseling, and we can refer you to a psychiatric provider for medication evaluations when that's helpful. I can note your interest so the team coordinates the right care."),
        ("Do you see couples, families, or teens?",
         "Yes, we offer individual, couples, family, and adolescent therapy depending on the clinician. Tell me who the sessions are for and I'll match you with someone experienced in that area."),
        ("How should I prepare for my appointment?",
         "There's nothing formal to prepare, just come as you are. It can help to jot down what you'd like to focus on, and for telehealth, find a quiet, private space with a stable connection."),
        ("What's your policy on missed appointments?",
         "We ask for 24 hours' notice to cancel so we can offer the time to another client. We send reminders to help, and we understand that things come up, so please just let us know."),
        ("How do you match me with the right therapist?",
         "I'll ask about what you're seeking, any preferences, and your schedule, then match you with a clinician whose specialty fits. If it's not the right fit, we'll gladly help you switch."),
        ("How long is the wait to be seen?",
         "It depends on the clinician and whether you choose telehealth, but we often have openings within a week. I can book the soonest available time or add you to a waitlist for a specific therapist."),
        ("How do I get a copy of my records?",
         "You can request your records with a signed release, and our team will process it securely. I can start that request and let you know what to expect."),
        ("Where are you located, or can I attend from home?",
         "I can text you our office address and parking details, and many clients attend by secure video from home. Let me know which you prefer and I'll set it up."),
    ],
    "salon_spa": [
        ("What are your hours?",
         "We're open Tuesday through Saturday from 9:00 AM to 7:00 PM, and Sundays from 10:00 AM to 5:00 PM. I'd be happy to find a time that works for you."),
        ("How do I book an appointment?",
         "I can book it for you right now. Just let me know the service you'd like, your preferred day and time, and whether you have a favorite provider, and I'll reserve your spot."),
        ("What services and treatments do you offer?",
         "We offer salon and spa services like haircuts and color, manicures, massage, and waxing, plus aesthetic treatments such as laser hair removal, facials, skin rejuvenation, injectables, and body treatments. Tell me what you're interested in and I'll share availability and pricing."),
        ("Do you do laser hair removal?",
         "Yes, we offer laser hair removal for both women and men across most areas of the body. Most clients need a series of sessions for the best results, and I can book a consultation to create a plan and quote for you."),
        ("How much do your services cost?",
         "Pricing depends on the service and the area treated, and many treatments are available as discounted packages. I can share menu prices for anything you're interested in or text you the full menu. Would that help?"),
        ("How do I cancel or reschedule?",
         "You can reschedule or cancel through me or by calling us. We ask for at least 24 hours' notice so we can offer the time to another client, and I'll send you a confirmation."),
        ("Do I need a consultation before a treatment?",
         "For laser, injectable, and some skin treatments we start with a quick consultation to assess your skin and goals and confirm it's a good fit. It's usually complimentary, and I can book one for you now."),
        ("Do you take walk-ins or do I need an appointment?",
         "We welcome walk-ins for quick services when we have openings, but booking ahead guarantees your time and preferred provider, and treatments like laser or facials are by appointment. I can check today's availability for you."),
        ("Do you offer memberships or treatment packages?",
         "Yes, we offer memberships and prepaid packages that save you money on regular visits and on multi-session treatments like laser hair removal and facials. I can explain the options and get you signed up."),
        ("Do you sell gift cards?",
         "Yes, gift cards are available in any amount and make great gifts. I can take your order now and have one emailed or ready for pickup, whichever you prefer."),
        ("How early should I arrive?",
         "Please arrive about 10 to 15 minutes early so you can relax and we can start on time. New clients may want a few extra minutes for a quick intake or consultation form, which I can email you in advance."),
        ("What's your cancellation or no-show policy?",
         "We ask for 24 hours' notice to cancel, and a fee may apply for late cancellations or no-shows since the time was reserved for you. We send reminders to help you keep track."),
        ("Do I need a patch test before laser or a facial?",
         "For laser treatments and some facials we do a quick patch test in advance to make sure your skin responds well. Let me note any allergies or sensitivities and book the patch test ahead of your first session."),
        ("How many laser sessions will I need?",
         "Most clients see the best results after a series of sessions spaced a few weeks apart, since hair grows in cycles. Your provider will recommend a personalized plan at your consultation, and packages make the series more affordable."),
        ("Is there any downtime after a facial or laser treatment?",
         "Many treatments have little to no downtime, though some redness or sensitivity is normal for a short time. Your provider will go over simple aftercare, and I can text you pre- and post-care tips before your visit."),
        ("Are your treatments safe during pregnancy or with a health condition?",
         "Some treatments, including certain lasers, injectables, and massage, may need to be adjusted or postponed during pregnancy or with some conditions. I'll note it so your provider can review what's safe and tailor your plan."),
        ("Can you handle a group, bridal party, or event?",
         "Yes, we love group and bridal bookings and can arrange hair, makeup, nails, and spa services together. Share your date and party size and I'll connect you with our events coordinator."),
        ("Do you have a loyalty or referral program?",
         "Yes, we have a loyalty program that rewards repeat visits and a referral bonus when you bring a friend. I can enroll you now so you start earning on your next appointment."),
        ("Can I request a specific provider, and do you sell skincare products?",
         "Of course — tell me who you'd like and I'll book you with them, or suggest another highly rated provider if they're unavailable. We also carry the skincare and haircare products our team uses and can set some aside for you."),
        ("What payment methods do you accept, and do you have first-time specials?",
         "We accept all major cards and contactless payment, gratuity is appreciated for your provider, and we offer a welcome discount for first-time clients on select services. I can apply it to your booking now."),
    ],
}


def build_industry_url(base_url: str, slug: str) -> str:
    """Derive the per-industry connection URL by swapping the db name to demo_<slug>.

    The base URL points at db `demo`; we replace exactly that trailing path
    segment (preserving any query string) with `demo_<slug>`.
    """
    target_db = f"demo_{slug}"
    # Replace the db name segment after the host/port, keeping any ?query.
    new_url, n = re.subn(r"(://[^/]+/)demo(\b)(?=$|\?)", rf"\1{target_db}\2", base_url)
    if n != 1:
        # Fallback: replace the last path segment before an optional query.
        new_url, n = re.subn(r"/[^/?]+(\?.*)?$", rf"/{target_db}\1", base_url)
        if n != 1:
            raise ValueError(f"Could not derive per-industry URL from base for slug {slug!r}")
    return new_url


def get_openai_client():
    from openai import OpenAI

    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set in the environment / .env")
    return OpenAI(api_key=key)


def embed_questions(client, questions: List[str]) -> List[List[float]]:
    """Embed a batch of question strings, preserving order. Returns 1536-dim vectors."""
    resp = client.embeddings.create(model=EMBED_MODEL, input=questions)
    # The API returns embeddings indexed by input order.
    vectors = [item.embedding for item in sorted(resp.data, key=lambda d: d.index)]
    for v in vectors:
        if len(v) != EMBED_DIMS:
            raise ValueError(f"Unexpected embedding dim {len(v)} (expected {EMBED_DIMS})")
    return vectors


def vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def seed_industry(base_url: str, slug: str, client) -> int:
    """Seed kb.qa for a single industry's database. Returns rows inserted."""
    import psycopg2

    pairs = QA_BY_INDUSTRY[slug]
    url = build_industry_url(base_url, slug)
    db_name = url.rsplit("/", 1)[-1].split("?")[0]

    logger.info(f"[{slug}] embedding {len(pairs)} questions...")
    questions = [q for q, _ in pairs]
    vectors = embed_questions(client, questions)

    conn = None
    try:
        conn = psycopg2.connect(url)
        conn.autocommit = False
        with conn.cursor() as cur:
            # Idempotent: clear and re-insert inside one transaction.
            cur.execute("TRUNCATE kb.qa RESTART IDENTITY")
            for (question, answer), vec in zip(pairs, vectors):
                cur.execute(
                    "INSERT INTO kb.qa (question, answer, embedding) "
                    "VALUES (%s, %s, %s::vector)",
                    (question, answer, vec_literal(vec)),
                )
            conn.commit()
        logger.info(f"[{slug}] inserted {len(pairs)} rows into {db_name}.kb.qa")
        return len(pairs)
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            conn.close()


def main() -> int:
    base_url = os.getenv("DATABASE_URL", "").strip()
    if not base_url:
        logger.error("DATABASE_URL is not set in the environment / .env")
        return 1

    client = get_openai_client()

    results: Dict[str, int] = {}
    failures: Dict[str, str] = {}

    for slug in INDUSTRY_SLUGS:
        try:
            results[slug] = seed_industry(base_url, slug, client)
        except Exception as e:  # noqa: BLE001 - report per-industry, keep going
            failures[slug] = str(e)
            logger.error(f"[{slug}] FAILED: {e}")
        time.sleep(0.1)  # gentle pacing between databases

    logger.info("=" * 60)
    logger.info("Seed summary:")
    for slug in INDUSTRY_SLUGS:
        if slug in results:
            logger.info(f"  {slug:<14} -> {results[slug]} rows")
        else:
            logger.info(f"  {slug:<14} -> FAILED: {failures.get(slug)}")
    logger.info("=" * 60)

    return 0 if not failures else 2


if __name__ == "__main__":
    sys.exit(main())
