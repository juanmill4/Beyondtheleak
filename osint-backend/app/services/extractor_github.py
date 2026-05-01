import httpx
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

async def extract_github(username: str) -> Dict[str, Any]:
    """
    Extracts public profile information from GitHub using their unauthenticated API.
    """
    if not username:
        return {}

    logger.info(f"Running GitHub extractor for user: {username}")
    
    url = f"https://api.github.com/users/{username}"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            
            if response.status_code == 200:
                data = response.json()
                # Filter down to the most relevant OSINT fields or return the whole dict
                return {
                    "login": data.get("login"),
                    "name": data.get("name"),
                    "company": data.get("company"),
                    "blog": data.get("blog"),
                    "location": data.get("location"),
                    "email": data.get("email"),
                    "twitter_username": data.get("twitter_username"),
                    "bio": data.get("bio"),
                    "public_repos": data.get("public_repos"),
                    "followers": data.get("followers"),
                    "following": data.get("following"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "avatar_url": data.get("avatar_url")
                }
            elif response.status_code == 404:
                logger.info(f"GitHub user {username} not found (404).")
                return {"error": "User not found on GitHub"}
            else:
                logger.warning(f"GitHub API returned unexpected status code: {response.status_code} for {username}")
                return {"error": f"GitHub API error: {response.status_code}"}
                
    except Exception as e:
        logger.error(f"GitHub extraction failed for {username}: {str(e)}")
        return {"error": str(e)}
