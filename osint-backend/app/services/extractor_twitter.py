import os
import logging
from typing import Dict, Any
from twscrape import API, gather
from twscrape.logger import set_log_level

logger = logging.getLogger(__name__)
DB_PATH = os.getenv("TWSCRAPE_DB_PATH", "./accounts.db")

async def extract_twitter(username: str) -> Dict[str, Any]:
    """
    Uses twscrape to extract data from X/Twitter.
    Assumes an initialized AccountsPool in the SQLite database.
    """
    if not username:
        return {}
        
    logger.info(f"Running Twscrape for X user: {username}")
    
    try:
        # Initialize API using the standalone SQLite pool
        api = API(pool=DB_PATH)
        
        # In a real environment, you must have added accounts:
        # await api.pool.add_account("user", "pass", "email", "email_pass")
        # await api.pool.login_all()
        
        # Fetch user info
        user_info = await api.user_by_login(username)
        if not user_info:
            return {"error": "User not found on X"}
            
        # Fetch last 10 tweets
        tweets = await gather(api.user_tweets(user_info.id, limit=10))
        
        # Fetch a sample of followers
        followers = await gather(api.followers(user_info.id, limit=20))
        
        return {
            "bio": user_info.rawDescription,
            "followers_count": user_info.followersCount,
            "following_count": user_info.friendsCount,
            "recent_tweets": [t.rawContent for t in tweets],
            "followers_sample": [f.username for f in followers]
        }

    except Exception as e:
        logger.error(f"Twscrape execution failed: {str(e)}")
        return {"error": str(e)}
