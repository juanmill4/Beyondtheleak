import asyncio
import json
import logging
import os
import tempfile
import uuid
from typing import List, Optional

logger = logging.getLogger(__name__)

async def run_sherlock(username: str) -> List[str]:
    """
    Executes Sherlock CLI via subprocess to find accounts associated with a username.
    Sherlock is expected to be installed in the environment (`pip install sherlock-project`).
    """
    if not username:
        return []

    # Use a unique temporary file for the JSON output to avoid race conditions
    temp_file = os.path.join(tempfile.gettempdir(), f"sherlock_{uuid.uuid4()}.json")
    
    import sys
    try:
        # Build the command. We use --json to get structured output
        # and --timeout to prevent it from hanging indefinitely.
        cmd = [
            sys.executable, "-m", "sherlock", 
            username, 
            "--timeout", "5",
            "--json", temp_file
        ]
        
        logger.info(f"Running Sherlock for {username}...")
        
        # Run Sherlock asynchronously using asyncio.create_subprocess_exec
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        # Wait for Sherlock to complete (it can take 2-5 minutes depending on connection)
        # We wrap it in a timeout to ensure our Celery worker doesn't stall forever natively.
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=360)
        except asyncio.TimeoutError:
            logger.warning(f"Sherlock timed out for {username}. Attempting to kill.")
            process.kill()
            await process.communicate()
            raise TimeoutError(f"Sherlock search for {username} exceeded 6 minutes.")

        # If the file was created, parse it
        discoveries = []
        if os.path.exists(temp_file):
            with open(temp_file, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    # Sherlock JSON structure usually maps username to a dict of site -> info
                    if username in data:
                        for site, info in data[username].items():
                            if info.get("status") == "claimed":
                                url_main = info.get("url_main")
                                url_user = info.get("url_user")
                                if url_user:
                                    discoveries.append(url_user)
                except json.JSONDecodeError:
                    logger.error("Failed to parse Sherlock JSON output")
        else:
            logger.warning(f"Sherlock did not create an output file for {username}.")
            
        return discoveries

    except Exception as e:
        logger.error(f"Sherlock extraction failed: {str(e)}")
        return []
    finally:
        # Cleanup temp file
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass
