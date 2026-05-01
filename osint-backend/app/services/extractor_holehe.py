import trio
import httpx
import logging
from typing import List
from argparse import Namespace

# Import the actual operational functions from Holehe, abandoning our mock class.
from holehe.core import import_submodules, get_functions, launch_module

logger = logging.getLogger(__name__)

async def _check_email(email: str) -> List[str]:
    """
    Internal trio-based async runner for Holehe
    """
    if not email:
        return []

    # Holehe requires an argparse object for parsing configurations natively
    args = Namespace(nopasswordrecovery=False)
    
    # Load all modules dynamically
    modules = import_submodules("holehe.modules")
    websites = get_functions(modules, args)
    
    out = []
    
    async with httpx.AsyncClient(timeout=10) as client:
        # Launch checks concurrently
        async with trio.open_nursery() as nursery:
            for website in websites:
                # launch_module handles exceptions and appends to the `out` list natively
                nursery.start_soon(launch_module, website, email, client, out)
    
    # Filter the exact platforms where the email exists
    registered_platforms = []
    for info in out:
        if info.get("exists") is True:
            registered_platforms.append({
                "name": info.get("name"),
                "domain": info.get("domain", info.get("name")),
                "emailrecovery": info.get("emailrecovery"),
                "phoneNumber": info.get("phoneNumber"),
                "others": info.get("others")
            })
    
    return registered_platforms

async def run_holehe(email: str) -> List[str]:
    """
    Checks if an email is registered on various platforms using Holehe.
    Translates the trio-based execution to an asyncio compatible wrapper or wraps it.
    """
    if not email:
        return []
    
    logger.info(f"Running Holehe for {email}...")
    try:
        # Holehe uses Trio natively. To run it inside our asyncio/Celery context, 
        # we have to explicitly launch the trio run loop for this isolated task.
        results = trio.run(_check_email, email)
        return results
    except Exception as e:
        logger.error(f"Holehe extraction failed: {str(e)}")
        return []
