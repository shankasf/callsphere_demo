"""
Database queries for URackIT AI Service.

Provides function tools for AI agents to interact with the database.
All functions are decorated with @function_tool to make them callable by agents.

Migrated from Supabase REST to direct PostgreSQL via psycopg2.
"""

from datetime import datetime
from typing import Optional
import logging

from agents import function_tool
from .connection import get_db

logger = logging.getLogger(__name__)

# Get database class
db = get_db()


def _format_error(err: Exception) -> str:
    """Return a user-friendly message from a database error."""
    return str(err)


# ============================================
# Organization Management
# ============================================

@function_tool
def find_organization_by_ue_code(u_e_code: int) -> str:
    """
    Look up an organization by its U&E code (Unique Enterprise Code).
    This is the PRIMARY method to identify callers - always ask for U&E code first.

    Args:
        u_e_code: The unique enterprise code (4-digit number, e.g., 3450, 3629)

    Returns:
        Organization details if found, or error message if not found.
    """
    try:
        # Normalize inputs (the model may pass a string despite the schema being integer).
        if isinstance(u_e_code, str):
            normalized = "".join(ch for ch in u_e_code.strip() if ch.isdigit())
            if not normalized:
                return "U&E code must be numeric. Please say only the digits of your U&E code."
            u_e_code = int(normalized)

        row = db.select_one(
            """
            SELECT o.organization_id, o.name, o.u_e_code,
                   am.full_name AS manager_name,
                   am.email    AS manager_email,
                   am.phone    AS manager_phone
            FROM organizations o
            LEFT JOIN account_managers am ON am.manager_id = o.manager_id
            WHERE o.u_e_code = %s
            """,
            (u_e_code,),
        )

        if not row:
            return f"No organization found with U&E code: {u_e_code}. Please ask the caller to confirm their code."

        return (
            f"Organization verified successfully!\n"
            f"Organization Name: {row['name']}\n"
            f"U&E Code: {row['u_e_code']}\n"
            f"Account Manager: {row.get('manager_name') or 'Not Assigned'}\n"
            f"organization_id: {row['organization_id']}"
        )
    except Exception as e:
        return f"Error looking up organization: {_format_error(e)}"


@function_tool
def find_organization_by_name(name: str) -> str:
    """
    Look up an organization by name.
    """
    if not name.strip():
        return "Organization name is required."

    try:
        rows = db.select(
            """
            SELECT o.organization_id, o.name, o.u_e_code,
                   am.full_name AS manager_name
            FROM organizations o
            LEFT JOIN account_managers am ON am.manager_id = o.manager_id
            WHERE o.name ILIKE %s
            LIMIT 5
            """,
            (f"%{name.strip()}%",),
        )

        if not rows:
            return f"No organization found with name: {name}"

        result = f"Found {len(rows)} organization(s):\n"
        for org in rows:
            result += (
                f"- {org['name']} (U&E: {org['u_e_code']}) "
                f"- Manager: {org.get('manager_name') or 'N/A'}\n"
            )
        return result
    except Exception as e:
        return f"Error looking up organization: {_format_error(e)}"


@function_tool
def create_organization(name: str, u_e_code: int) -> str:
    """
    Create a new organization.

    Args:
        name: Organization name
        u_e_code: Unique enterprise code
    """
    if not name.strip():
        return "Organization name is required."

    try:
        row = db.insert("organizations", {
            "name": name.strip(),
            "u_e_code": u_e_code,
        })
        if row:
            return f"Organization created successfully. organization_id: {row['organization_id']}"
        return "Failed to create organization."
    except Exception as e:
        return f"Error creating organization: {_format_error(e)}"


# ============================================
# Contact Management
# ============================================

@function_tool
def find_contact_by_phone(phone: str) -> str:
    """
    Look up a contact by their phone number.
    """
    if not phone.strip():
        return "Phone number is required."

    try:
        clean_phone = (
            phone.strip()
            .replace("-", "")
            .replace("(", "")
            .replace(")", "")
            .replace(" ", "")
        )

        rows = db.select(
            """
            SELECT c.contact_id, c.organization_id, c.full_name, c.email, c.phone,
                   o.name AS org_name, o.u_e_code
            FROM contacts c
            LEFT JOIN organizations o ON o.organization_id = c.organization_id
            WHERE c.phone ILIKE %s
               OR c.phone ILIKE %s
            LIMIT 1
            """,
            (f"%{clean_phone}%", f"%{phone.strip()}%"),
        )

        if not rows:
            return f"No contact found with phone: {phone}"

        contact = rows[0]
        return (
            f"Contact found: {contact['full_name']}\n"
            f"Organization: {contact.get('org_name') or 'N/A'}\n"
            f"Phone: {contact.get('phone')}\n"
            f"Email: {contact.get('email') or 'N/A'}\n"
            f"contact_id: {contact['contact_id']}\n"
            f"organization_id: {contact['organization_id']}"
        )
    except Exception as e:
        return f"Error looking up contact: {_format_error(e)}"


@function_tool
def create_contact(
    full_name: str,
    organization_id: int,
    email: str = "",
    phone: str = "",
) -> str:
    """
    Create a new contact record.

    Args:
        full_name: Contact's full name (REQUIRED)
        organization_id: ID of the organization (REQUIRED)
        email: Contact's email address (optional - only include if caller provides it)
        phone: Contact's phone number (optional)

    IMPORTANT: Do NOT make up or guess email addresses. Only include email if the caller explicitly provides it.
    """
    if not full_name.strip():
        return "Full name is required."
    if not organization_id:
        return "organization_id is required."

    try:
        data = {
            "full_name": full_name.strip(),
            "organization_id": organization_id,
        }
        if email.strip():
            data["email"] = email.strip()
        if phone.strip():
            data["phone"] = phone.strip()

        row = db.insert("contacts", data)
        if row:
            return (
                f"Contact created successfully.\n"
                f"contact_id: {row['contact_id']}\n"
                f"organization_id: {organization_id}"
            )
        return "Failed to create contact."
    except Exception as e:
        return f"Error creating contact: {_format_error(e)}"


@function_tool
def get_contact_devices(contact_id: int) -> str:
    """
    Get all devices assigned to a contact.
    """
    try:
        rows = db.select(
            """
            SELECT d.device_id, d.asset_name, d.status, d.host_name
            FROM contact_devices cd
            JOIN devices d ON d.device_id = cd.device_id
            WHERE cd.contact_id = %s
              AND cd.unassigned_at IS NULL
            """,
            (contact_id,),
        )

        if not rows:
            return f"No devices assigned to contact {contact_id}"

        result = f"Found {len(rows)} device(s):\n"
        for d in rows:
            result += f"- {d['asset_name']} ({d['status']}) - device_id: {d['device_id']}\n"
        return result
    except Exception as e:
        return f"Error getting devices: {_format_error(e)}"


# ============================================
# Device Management
# ============================================

@function_tool
def find_device_by_name(asset_name: str) -> str:
    """
    Look up a device by its asset name.
    """
    try:
        row = db.select_one(
            """
            SELECT d.device_id, d.asset_name, d.status, d.host_name, d.public_ip,
                   o.name AS org_name
            FROM devices d
            LEFT JOIN organizations o ON o.organization_id = d.organization_id
            WHERE d.asset_name ILIKE %s
            LIMIT 1
            """,
            (f"%{asset_name.strip()}%",),
        )

        if not row:
            return f"No device found with name: {asset_name}"

        return (
            f"Device: {row['asset_name']}\n"
            f"Status: {row['status']}\n"
            f"Hostname: {row.get('host_name') or 'N/A'}\n"
            f"IP: {row.get('public_ip') or 'N/A'}\n"
            f"Organization: {row.get('org_name') or 'N/A'}\n"
            f"device_id: {row['device_id']}"
        )
    except Exception as e:
        return f"Error finding device: {_format_error(e)}"


@function_tool
def get_device_status(device_id: int) -> str:
    """
    Get the current status and details of a device.
    """
    try:
        row = db.select_one(
            """
            SELECT asset_name, status, host_name, last_reported_time,
                   system_uptime, last_logged_in_by
            FROM devices
            WHERE device_id = %s
            """,
            (device_id,),
        )

        if not row:
            return f"Device {device_id} not found."

        return (
            f"Device: {row['asset_name']}\n"
            f"Status: {row['status']}\n"
            f"Hostname: {row.get('host_name') or 'N/A'}\n"
            f"Last Reported: {row.get('last_reported_time') or 'N/A'}\n"
            f"Uptime: {row.get('system_uptime') or 'N/A'}\n"
            f"Last User: {row.get('last_logged_in_by') or 'N/A'}"
        )
    except Exception as e:
        return f"Error getting device: {_format_error(e)}"


@function_tool
def get_device_details(device_id: int) -> str:
    """
    Get full details of a device including hardware specs.
    """
    try:
        row = db.select_one(
            """
            SELECT d.device_id, d.asset_name, d.host_name, d.status,
                   d.public_ip, d.gateway, d.total_memory, d.last_reported_time,
                   o.name  AS org_name,
                   l.name  AS loc_name,
                   os.name AS os_name
            FROM devices d
            LEFT JOIN organizations o ON o.organization_id = d.organization_id
            LEFT JOIN locations l     ON l.location_id     = d.location_id
            LEFT JOIN operating_systems os ON os.os_id     = d.os_id
            WHERE d.device_id = %s
            """,
            (device_id,),
        )

        if not row:
            return f"Device {device_id} not found."

        return (
            f"=== Device Details ===\n"
            f"Asset Name: {row['asset_name']}\n"
            f"Hostname: {row.get('host_name') or 'N/A'}\n"
            f"Status: {row['status']}\n"
            f"Organization: {row.get('org_name') or 'N/A'}\n"
            f"Location: {row.get('loc_name') or 'N/A'}\n"
            f"Public IP: {row.get('public_ip') or 'N/A'}\n"
            f"Gateway: {row.get('gateway') or 'N/A'}\n"
            f"OS: {row.get('os_name') or 'N/A'}\n"
            f"Memory: {row.get('total_memory') or 'N/A'}\n"
            f"Last Reported: {row.get('last_reported_time') or 'N/A'}\n"
            f"device_id: {row['device_id']}"
        )
    except Exception as e:
        return f"Error getting device details: {_format_error(e)}"


@function_tool
def get_organization_devices(organization_id: int) -> str:
    """
    Get ALL devices for an organization.
    Use this when user asks about devices for their organization.
    """
    try:
        rows = db.select(
            """
            SELECT d.device_id, d.asset_name, d.status, d.host_name,
                   l.name AS loc_name
            FROM devices d
            LEFT JOIN locations l ON l.location_id = d.location_id
            WHERE d.organization_id = %s
            ORDER BY d.status DESC, d.asset_name ASC
            """,
            (organization_id,),
        )

        if not rows:
            return f"No devices found for organization {organization_id}"

        online = sum(1 for d in rows if d.get("status") == "ONLINE")
        offline = len(rows) - online

        result = f"Found {len(rows)} device(s) ({online} online, {offline} offline):\n\n"
        for d in rows:
            status_icon = "+" if d.get("status") == "ONLINE" else "-"
            result += (
                f"{status_icon} {d['asset_name']} - {d['status']} "
                f"@ {d.get('loc_name') or 'Unknown'}\n"
            )
        return result
    except Exception as e:
        return f"Error getting devices: {_format_error(e)}"


# ============================================
# Ticket Management
# ============================================

@function_tool
def create_ticket(
    subject: str,
    description: str,
    contact_id: int,
    organization_id: int = 0,
    priority: str = "Medium",
    device_id: int = 0,
) -> str:
    """
    Create a new support ticket.

    Args:
        subject: Brief description of the issue
        description: Detailed description of the problem
        contact_id: ID of the contact creating the ticket (REQUIRED)
        organization_id: ID of the organization
        priority: Critical, High, Medium, or Low
        device_id: ID of the affected device (optional)
    """
    if not subject.strip():
        return "Subject is required."
    if not contact_id:
        return "contact_id is required."

    try:
        # Get organization from contact if not provided
        if not organization_id:
            row = db.select_one(
                "SELECT organization_id FROM contacts WHERE contact_id = %s",
                (contact_id,),
            )
            if row:
                organization_id = row["organization_id"]

        if not organization_id:
            return "Could not determine organization."

        # Map priority to ID
        priority_map = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        priority_id = priority_map.get(priority.lower().strip(), 2)

        ticket_data = {
            "subject": subject.strip(),
            "description": description.strip() or None,
            "contact_id": contact_id,
            "organization_id": organization_id,
            "status_id": 1,  # Open
            "priority_id": priority_id,
            "requires_human_agent": False,
        }
        if device_id:
            ticket_data["device_id"] = device_id

        row = db.insert("support_tickets", ticket_data)
        if row:
            return f"Ticket created successfully. Ticket ID: {row['ticket_id']}"
        return "Failed to create ticket."
    except Exception as e:
        return f"Error creating ticket: {_format_error(e)}"


@function_tool
def lookup_ticket(ticket_id: int) -> str:
    """
    Look up a ticket by its ID.
    """
    try:
        row = db.select_one(
            """
            SELECT st.ticket_id, st.subject, st.description, st.created_at,
                   c.full_name  AS contact_name,
                   c.phone      AS contact_phone,
                   o.name       AS org_name,
                   ts.name      AS status_name,
                   tp.name      AS priority_name
            FROM support_tickets st
            LEFT JOIN contacts c          ON c.contact_id        = st.contact_id
            LEFT JOIN organizations o     ON o.organization_id   = st.organization_id
            LEFT JOIN ticket_statuses ts  ON ts.status_id        = st.status_id
            LEFT JOIN ticket_priorities tp ON tp.priority_id     = st.priority_id
            WHERE st.ticket_id = %s
            """,
            (ticket_id,),
        )

        if not row:
            return f"Ticket {ticket_id} not found."

        return (
            f"Ticket #{ticket_id}\n"
            f"Subject: {row['subject']}\n"
            f"Status: {row.get('status_name') or 'Unknown'}\n"
            f"Priority: {row.get('priority_name') or 'Unknown'}\n"
            f"Description: {row.get('description') or 'N/A'}\n"
            f"Contact: {row.get('contact_name') or 'N/A'}\n"
            f"Organization: {row.get('org_name') or 'N/A'}\n"
            f"Created: {row.get('created_at')}"
        )
    except Exception as e:
        return f"Error looking up ticket: {_format_error(e)}"


@function_tool
def get_tickets_by_contact(contact_id: int) -> str:
    """
    Get all tickets for a specific contact.
    """
    try:
        rows = db.select(
            """
            SELECT st.ticket_id, st.subject, st.created_at,
                   ts.name AS status_name,
                   tp.name AS priority_name
            FROM support_tickets st
            LEFT JOIN ticket_statuses ts  ON ts.status_id    = st.status_id
            LEFT JOIN ticket_priorities tp ON tp.priority_id = st.priority_id
            WHERE st.contact_id = %s
            ORDER BY st.created_at DESC
            LIMIT 10
            """,
            (contact_id,),
        )

        if not rows:
            return f"No tickets found for contact {contact_id}"

        result = f"Found {len(rows)} ticket(s):\n"
        for t in rows:
            result += f"- #{t['ticket_id']}: {t['subject']} [{t.get('status_name') or 'Unknown'}]\n"
        return result
    except Exception as e:
        return f"Error getting tickets: {_format_error(e)}"


@function_tool
def get_tickets_by_organization(organization_id: int) -> str:
    """
    Get all open tickets for an organization.
    """
    try:
        rows = db.select(
            """
            SELECT st.ticket_id, st.subject,
                   ts.name      AS status_name,
                   tp.name      AS priority_name,
                   c.full_name  AS contact_name
            FROM support_tickets st
            LEFT JOIN ticket_statuses ts   ON ts.status_id    = st.status_id
            LEFT JOIN ticket_priorities tp ON tp.priority_id  = st.priority_id
            LEFT JOIN contacts c           ON c.contact_id    = st.contact_id
            WHERE st.organization_id = %s
              AND st.status_id IN (1, 2, 3, 4)
            ORDER BY st.created_at DESC
            LIMIT 20
            """,
            (organization_id,),
        )

        if not rows:
            return f"No open tickets for organization {organization_id}"

        result = f"Found {len(rows)} open ticket(s):\n"
        for t in rows:
            result += (
                f"- #{t['ticket_id']}: {t['subject']} "
                f"- {t.get('contact_name') or 'Unknown'} "
                f"[{t.get('status_name') or 'Unknown'}]\n"
            )
        return result
    except Exception as e:
        return f"Error getting tickets: {_format_error(e)}"


@function_tool
def update_ticket_status(ticket_id: int, status: str) -> str:
    """
    Update the status of a ticket.

    Args:
        ticket_id: The ticket ID
        status: Open, In Progress, Awaiting Customer, Escalated, Resolved, Closed
    """
    status_map = {
        "open": 1,
        "in progress": 2,
        "awaiting customer": 3,
        "escalated": 4,
        "resolved": 5,
        "closed": 6,
    }

    status_id = status_map.get(status.lower().strip())
    if not status_id:
        return f"Invalid status. Use: {', '.join(status_map.keys())}"

    try:
        now = datetime.utcnow().isoformat()

        if status_id in (5, 6):
            rows = db.execute(
                """
                UPDATE support_tickets
                SET status_id = %s, updated_at = %s, closed_at = %s
                WHERE ticket_id = %s
                RETURNING ticket_id
                """,
                (status_id, now, now, ticket_id),
            )
        else:
            rows = db.execute(
                """
                UPDATE support_tickets
                SET status_id = %s, updated_at = %s
                WHERE ticket_id = %s
                RETURNING ticket_id
                """,
                (status_id, now, ticket_id),
            )

        if rows:
            return f"Ticket {ticket_id} status updated to: {status}"
        return f"Failed to update ticket {ticket_id}"
    except Exception as e:
        return f"Error updating ticket: {_format_error(e)}"


@function_tool
def add_ticket_message(ticket_id: int, message: str) -> str:
    """
    Add a message/note to a ticket.
    """
    if not message.strip():
        return "Message content is required."

    try:
        row = db.insert("ticket_messages", {
            "ticket_id": ticket_id,
            "content": message.strip(),
            "message_type": "text",
            "sender_agent_id": 1,  # Bot agent
        })
        if row:
            return f"Message added to ticket {ticket_id}"
        return "Failed to add message."
    except Exception as e:
        return f"Error adding message: {_format_error(e)}"


@function_tool
def escalate_ticket(ticket_id: int, reason: str, to_human: bool = True) -> str:
    """
    Escalate a ticket and mark for human agent.

    Args:
        ticket_id: The ticket ID
        reason: Reason for escalation
        to_human: Whether to mark as requiring human agent
    """
    try:
        now = datetime.utcnow().isoformat()

        db.execute(
            """
            UPDATE support_tickets
            SET status_id = 4, requires_human_agent = %s, updated_at = %s
            WHERE ticket_id = %s
            """,
            (to_human, now, ticket_id),
        )

        db.insert("ticket_escalations", {
            "ticket_id": ticket_id,
            "from_agent_id": 1,
            "reason": reason,
        })

        return f"Ticket {ticket_id} escalated. Reason: {reason}"
    except Exception as e:
        return f"Error escalating ticket: {_format_error(e)}"


@function_tool
def get_ticket_statuses() -> str:
    """Get all available ticket statuses."""
    try:
        rows = db.select("SELECT status_id, name FROM ticket_statuses ORDER BY status_id")
        if not rows:
            return "No statuses found."
        result = "Available statuses:\n"
        for s in rows:
            result += f"- {s['name']} (ID: {s['status_id']})\n"
        return result
    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_ticket_priorities() -> str:
    """Get all available ticket priorities."""
    try:
        rows = db.select("SELECT priority_id, name FROM ticket_priorities ORDER BY priority_id")
        if not rows:
            return "No priorities found."
        result = "Available priorities:\n"
        for p in rows:
            result += f"- {p['name']} (ID: {p['priority_id']})\n"
        return result
    except Exception as e:
        return f"Error: {_format_error(e)}"


# ============================================
# Organization Data Lookup (Universal)
# ============================================

@function_tool
def lookup_organization_data(
    organization_id: int,
    query_type: str,
    search_term: str = "",
) -> str:
    """
    Universal lookup tool for organization data.

    Args:
        organization_id: The organization ID from U&E code verification
        query_type: devices, locations, contacts, tickets, summary, find_device, find_contact
        search_term: Search term for find_* query types

    Returns:
        Requested data for the organization
    """
    query_type = query_type.lower().strip()

    try:
        if query_type == "devices":
            return get_organization_devices(organization_id)

        elif query_type == "locations":
            return get_organization_locations(organization_id)

        elif query_type == "contacts":
            return get_organization_contacts(organization_id)

        elif query_type == "tickets":
            return get_tickets_by_organization(organization_id)

        elif query_type == "summary":
            return get_organization_summary(organization_id)

        elif query_type == "find_device" and search_term:
            return get_device_by_name_for_org(search_term, organization_id)

        elif query_type == "find_contact" and search_term:
            return get_contact_by_name_for_org(search_term, organization_id)

        else:
            return f"Unknown query type: {query_type}. Use: devices, locations, contacts, tickets, summary"

    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_organization_locations(organization_id: int) -> str:
    """Get all locations for an organization."""
    try:
        rows = db.select(
            """
            SELECT location_id, name, location_type
            FROM locations
            WHERE organization_id = %s
            """,
            (organization_id,),
        )

        if not rows:
            return f"No locations found for organization {organization_id}"

        result = f"Found {len(rows)} location(s):\n"
        for loc in rows:
            result += f"- {loc['name']} ({loc.get('location_type') or 'Office'})\n"
        return result
    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_organization_contacts(organization_id: int) -> str:
    """Get all contacts for an organization."""
    try:
        rows = db.select(
            """
            SELECT contact_id, full_name, email, phone
            FROM contacts
            WHERE organization_id = %s
            """,
            (organization_id,),
        )

        if not rows:
            return f"No contacts found for organization {organization_id}"

        result = f"Found {len(rows)} contact(s):\n"
        for c in rows:
            result += f"- {c['full_name']} - {c.get('phone') or 'N/A'}\n"
        return result
    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_organization_summary(organization_id: int) -> str:
    """Get a summary overview of an organization."""
    try:
        # Organization details
        org = db.select_one(
            """
            SELECT o.name, o.u_e_code,
                   am.full_name AS manager_name
            FROM organizations o
            LEFT JOIN account_managers am ON am.manager_id = o.manager_id
            WHERE o.organization_id = %s
            """,
            (organization_id,),
        )
        if not org:
            org = {}

        # Device counts
        device_stats = db.select_one(
            """
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'ONLINE') AS online
            FROM devices
            WHERE organization_id = %s
            """,
            (organization_id,),
        )
        device_count = (device_stats or {}).get("total", 0)
        online_count = (device_stats or {}).get("online", 0)

        # Contact count
        contact_row = db.select_one(
            "SELECT COUNT(*) AS cnt FROM contacts WHERE organization_id = %s",
            (organization_id,),
        )
        contact_count = (contact_row or {}).get("cnt", 0)

        # Open ticket count
        ticket_row = db.select_one(
            """
            SELECT COUNT(*) AS cnt
            FROM support_tickets
            WHERE organization_id = %s AND status_id IN (1, 2, 3, 4)
            """,
            (organization_id,),
        )
        ticket_count = (ticket_row or {}).get("cnt", 0)

        return (
            f"=== Organization Summary ===\n"
            f"Name: {org.get('name') or 'Unknown'}\n"
            f"U&E Code: {org.get('u_e_code') or 'N/A'}\n"
            f"Account Manager: {org.get('manager_name') or 'Not Assigned'}\n\n"
            f"Devices: {device_count} ({online_count} online, {device_count - online_count} offline)\n"
            f"Contacts: {contact_count}\n"
            f"Open Tickets: {ticket_count}"
        )
    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_device_by_name_for_org(asset_name: str, organization_id: int) -> str:
    """Find a device by name within an organization."""
    try:
        rows = db.select(
            """
            SELECT device_id, asset_name, status, host_name, public_ip
            FROM devices
            WHERE organization_id = %s
              AND asset_name ILIKE %s
            """,
            (organization_id, f"%{asset_name.strip()}%"),
        )

        if not rows:
            return f"No device found matching '{asset_name}' in this organization"

        result = f"Found {len(rows)} matching device(s):\n"
        for d in rows:
            result += f"- {d['asset_name']} ({d['status']}) - {d.get('host_name') or 'N/A'}\n"
        return result
    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_contact_by_name_for_org(name: str, organization_id: int) -> str:
    """Find a contact by name within an organization."""
    try:
        rows = db.select(
            """
            SELECT contact_id, full_name, email, phone
            FROM contacts
            WHERE organization_id = %s
              AND full_name ILIKE %s
            """,
            (organization_id, f"%{name.strip()}%"),
        )

        if not rows:
            return f"No contact found matching '{name}' in this organization"

        result = f"Found {len(rows)} matching contact(s):\n"
        for c in rows:
            result += f"- {c['full_name']} - {c.get('phone') or 'N/A'} - {c.get('email') or 'N/A'}\n"
        return result
    except Exception as e:
        return f"Error: {_format_error(e)}"


@function_tool
def get_account_manager(organization_id: int) -> str:
    """Get the account manager for an organization."""
    try:
        row = db.select_one(
            """
            SELECT am.full_name, am.email, am.phone
            FROM organizations o
            JOIN account_managers am ON am.manager_id = o.manager_id
            WHERE o.organization_id = %s
            """,
            (organization_id,),
        )

        if not row:
            return "No account manager assigned"

        return (
            f"Account Manager: {row.get('full_name') or 'N/A'}\n"
            f"Email: {row.get('email') or 'N/A'}\n"
            f"Phone: {row.get('phone') or 'N/A'}"
        )
    except Exception as e:
        return f"Error: {_format_error(e)}"


# ============================================
# Transfer to Human
# ============================================

@function_tool
def transfer_to_human(reason: str = "Customer requested") -> str:
    """
    Transfer the call to a human support agent.
    This will connect the caller to an available technician.

    Args:
        reason: Reason for transfer (e.g., "Customer requested", "Complex issue")
    """
    return f"TRANSFER_TO_HUMAN|{reason}"


# ============================================
# Hang Up Call
# ============================================

@function_tool
def hang_up_call(reason: str = "Conversation completed") -> str:
    """
    End the call gracefully when the conversation is complete.
    Use this when:
    - The caller says goodbye (e.g., "bye", "thanks, that's all", "have a good day")
    - The issue has been resolved and caller confirms they're all set
    - The caller cannot be verified (no UE code) and has been informed
    - The caller indicates they have no more questions

    Args:
        reason: Reason for ending the call (e.g., "Caller said goodbye", "Issue resolved", "Verification failed")
    """
    return f"HANG_UP_CALL|{reason}"
