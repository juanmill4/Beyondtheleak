import trio
import httpx
import logging
from typing import List

# Example ignorant module imports (adjust based on actual package structure)
# from ignorant.core import Ignorant
# from ignorant.modules.social import instagram, snapchat
# from ignorant.modules.shopping import amazon

logger = logging.getLogger(__name__)

async def _check_phone(phone: str) -> List[str]:
    """
    Internal trio-based async runner for Ignorant.
    """
    if not phone:
        return []

    found_accounts = []
    
    # Placeholder for actual Ignorant invocation logic.
    # Like Holehe, Ignorant dynamically loads modules and runs them via Trio/HTTPX.
    # We await the specific checks.
    
    async with httpx.AsyncClient() as client:
        async with trio.open_nursery() as nursery:
            # Example simulation
            # nursery.start_soon(instagram.check, phone, client, found_accounts)
            # nursery.start_soon(snapchat.check, phone, client, found_accounts)
            pass
            
    # Process results
    registered_platforms = [info.get("name") for info in found_accounts if info.get("exists") is True]
    return registered_platforms

async def run_ignorant(phone: str) -> List[str]:
    """
    Checks if a phone number is registered on various platforms using Ignorant.
    Translates the trio-based execution similarly to Holehe.
    """
    if not phone:
        return []
    
    logger.info(f"Running Ignorant for {phone}...")
    try:
        results = trio.run(_check_phone, phone)
        return results
    except Exception as e:
        logger.error(f"Ignorant extraction failed: {str(e)}")
        return []
