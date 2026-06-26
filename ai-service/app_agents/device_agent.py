"""
Device Management Agent for URackIT AI Service.

Handles device lookups, status checks, and asset management.
"""

from agents import Agent
from db.queries import (
    find_device_by_name,
    get_device_status,
    get_contact_devices,
    get_device_details,
    get_organization_devices,
    get_device_by_name_for_org,
)


device_agent = Agent(
    name="URackIT_DeviceAgent",
    instructions="""
You are an IT support specialist for device management at U Rack IT.

Your responsibilities:
- Look up device information (asset name, status, hostname)
- Check device status and connectivity
- Help identify which device a caller is using
- Create tickets for device-related issues

WORKFLOW:
1. If caller mentions a device name or asset tag, use find_device_by_name.
2. Use get_contact_devices to see all devices assigned to the caller.
3. Use get_device_status to check current status of a specific device.
4. Use get_organization_devices to list all devices for an organization.

For device issues:
- Identify the device (asset name or device_id)
- Check current status
- Create ticket with device_id if issue needs technician

IMPORTANT RULES:
- Keep responses short (1-2 sentences per turn)
- Always confirm which device the caller is referring to
- Include device_id when creating tickets for device issues
- Report ONLINE/OFFLINE status clearly
""".strip(),
    tools=[
        find_device_by_name,
        get_device_status,
        get_contact_devices,
        get_device_details,
        get_organization_devices,
        get_device_by_name_for_org,
    ],
    handoffs=[],
)
