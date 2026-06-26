"""
Port utilities for dynamic port allocation.

Provides functions to find available ports when the preferred port is in use.
"""

import socket
from typing import Optional


def is_port_available(port: int, host: str = "0.0.0.0") -> bool:
    """
    Check if a port is available for binding.
    
    Args:
        port: The port number to check
        host: The host address to bind to
        
    Returns:
        True if the port is available, False otherwise
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
            return True
    except (socket.error, OSError):
        return False


def find_available_port(
    start_port: int,
    max_attempts: int = 100,
    host: str = "0.0.0.0"
) -> int:
    """
    Find an available port starting from the preferred port.
    
    Args:
        start_port: The preferred port to start searching from
        max_attempts: Maximum number of ports to try
        host: The host address to bind to
        
    Returns:
        An available port number
        
    Raises:
        RuntimeError: If no available port is found within max_attempts
    """
    for i in range(max_attempts):
        port = start_port + i
        if is_port_available(port, host):
            return port
        print(f"Port {port} is in use, trying next...")
    
    raise RuntimeError(f"Could not find an available port after {max_attempts} attempts")
