import os
import logging
from typing import Dict, Any, Optional
from apify_client import ApifyClientAsync

try:
    from dotenv import load_dotenv
    # Explicitly load from the backend directory to ensure the path is found regardless of where uvicorn is launched
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
    load_dotenv(dotenv_path=env_path)
except ImportError:
    pass

logger = logging.getLogger(__name__)

def get_apify_token():
    return os.getenv("APIFY_API_TOKEN")

async def scrape_tiktok(username: str) -> Dict[str, Any]:
    """
    Uses the clockworks/tiktok-scraper actor on Apify to extract TikTok profile data.
    """
    if not username:
        return {}
        
    token = get_apify_token()
    if not token:
        logger.warning("APIFY_API_TOKEN is missing. Skipping TikTok scrape.")
        return {"status": "skipped", "reason": "Missing APIFY_API_TOKEN"}

    client = ApifyClientAsync(token)
    
    # Payload for clockworks/tiktok-scraper
    run_input = {
        "profiles": [username],
        "resultsPerPage": 10,
        "shouldDownloadCovers": False,
        "shouldDownloadSlideshowImages": False,
        "shouldDownloadSubtitles": False,
        "shouldDownloadVideos": False
    }

    logger.info(f"Triggering clockworks/tiktok-scraper for {username} via Apify...")
    
    try:
        # Default behavior is to wait for finish
        run = await client.actor("clockworks/tiktok-scraper").call(run_input=run_input)
        
        # Fetch results
        results = []
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            results.append(item)
            
        return {"profile_data": results[0] if results else {}}
    except Exception as e:
        logger.error(f"Apify TikTok scraper failed: {str(e)}")
        return {"error": str(e)}

async def scrape_linkedin(linkedin_url: str) -> Dict[str, Any]:
    """
    Uses the dev_fusion/linkedin-profile-scraper actor on Apify to extract LinkedIn profile data.
    """
    if not linkedin_url:
        return {}
        
    token = get_apify_token()
    if not token:
        logger.warning("APIFY_API_TOKEN is missing. Skipping LinkedIn scrape.")
        return {"status": "skipped", "reason": "Missing APIFY_API_TOKEN"}

    client = ApifyClientAsync(token)
    
    run_input = {
        "linkedinUrls": [linkedin_url],
        "includeCertifications": True,
        "includeEducation": True,
        "includeExperience": True,
        "includeSkills": True,
    }

    logger.info(f"Triggering dev_fusion/linkedin-profile-scraper for {linkedin_url} via Apify...")
    
    try:
        run = await client.actor("dev_fusion/linkedin-profile-scraper").call(run_input=run_input)
        
        results = []
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            results.append(item)
            
        return {"profile_data": results[0] if results else {}}
    except Exception as e:
        logger.error(f"Apify LinkedIn scraper failed: {str(e)}")
        return {"error": str(e)}

async def scrape_instagram(username: str) -> Dict[str, Any]:
    """
    Uses the apify/instagram-profile-scraper actor on Apify to extract Instagram profile data.
    """
    if not username:
        return {}
        
    token = get_apify_token()
    if not token:
        logger.warning("APIFY_API_TOKEN is missing. Skipping Instagram scrape.")
        return {"status": "skipped", "reason": "Missing APIFY_API_TOKEN"}

    client = ApifyClientAsync(token)
    
    run_input = {
        "usernames": [username],
        "resultsLimit": 1
    }

    logger.info(f"Triggering apify/instagram-profile-scraper for {username} via Apify...")
    
    try:
        run = await client.actor("apify/instagram-profile-scraper").call(run_input=run_input)
        
        results = []
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            results.append(item)
            
        return {"profile_data": results[0] if results else {}}
    except Exception as e:
        return {"error": str(e)}

async def scrape_instagram_premium(username: str) -> Dict[str, Any]:
    """
    Uses the shu8hvrXbJbY3Eb9W actor on Apify to extract Instagram profile details and latest posts.
    """
    if not username:
        return {}
        
    token = get_apify_token()
    if not token:
        logger.warning("APIFY_API_TOKEN is missing. Skipping Instagram premium scrape.")
        return {"status": "skipped", "reason": "Missing APIFY_API_TOKEN"}

    client = ApifyClientAsync(token)
    
    run_input = {
        "directUrls": [f"https://www.instagram.com/{username}/"],
        "resultsType": "details",
        "resultsLimit": 3,
        "onlyPostsNewerThan": "90 days",
        "addParentData": False,
        "proxy": {
            "useApifyProxy": True,
            "apifyProxyCountry": "US"
        },
    }

    logger.info(f"Triggering shu8hvrXbJbY3Eb9W (Instagram) for {username} via Apify...")
    
    try:
        run = await client.actor("shu8hvrXbJbY3Eb9W").call(run_input=run_input)
        
        results = []
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            results.append(item)
            
        return {"profile_data": results[0] if results else {}, "all_results": results}
    except Exception as e:
        logger.error(f"Apify Instagram premium scraper failed: {str(e)}")
        return {"error": str(e)}

async def scrape_tiktok_premium(username: str) -> Dict[str, Any]:
    """
    Uses the clockworks/tiktok-profile-scraper actor on Apify to extract TikTok profile details and videos.
    """
    if not username:
        return {}
        
    token = get_apify_token()
    if not token:
        logger.warning("APIFY_API_TOKEN is missing. Skipping TikTok premium scrape.")
        return {"status": "skipped", "reason": "Missing APIFY_API_TOKEN"}

    client = ApifyClientAsync(token)
    
    run_input = {
        "excludePinnedPosts": False,
        "profiles": [username],
        "resultsPerPage": 10,
        "shouldDownloadAvatars": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSlideshowImages": False,
        "shouldDownloadSubtitles": False,
        "shouldDownloadVideos": False,
        "profileScrapeSections": ["videos"],
        "profileSorting": "latest"
    }

    logger.info(f"Triggering clockworks/tiktok-profile-scraper (TikTok) for {username} via Apify...")
    
    try:
        run = await client.actor("clockworks/tiktok-profile-scraper").call(run_input=run_input)
        
        results = []
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            results.append(item)
            
        return {"profile_data": results[0] if results else {}, "all_results": results}
    except Exception as e:
        logger.error(f"Apify TikTok premium scraper failed: {str(e)}")
        return {"error": str(e)}

async def scrape_x(username: str) -> Dict[str, Any]:
    """
    Uses the native X (Twitter) API v2 to extract profile details.
    """
    if not username:
        return {}
        
    bearer_token = "AAAAAAAAAAAAAAAAAAAAAOAM9AEAAAAAcEmgX9XJGUcTKf%2B7%2BXYxFk1EYIE%3DXpcwFVW8nthrXWIhvtPVaws2bxjOnROFt9HROa5dgVg5IxoJyK"
    
    url = f"https://api.x.com/2/users/by/username/{username}"
    params = {
        "user.fields": "created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld"
    }
    
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "User-Agent": "v2UserLookupPython"
    }

    logger.info(f"Triggering native X API for {username}...")
    
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            
            user_data = data.get("data", {})
            return {"profile_data": user_data, "all_results": []}
    except Exception as e:
        logger.error(f"Native X API failed for {username}: {str(e)}")
        return {"error": str(e)}

async def scrape_steam(username: str) -> Dict[str, Any]:
    """
    Uses native HTTP GET to extract Steam profile details from the HTML payload.
    """
    if not username:
        return {}
        
    # If the username is a purely numeric SteamID64 (usually 17 digits), the URL uses /profiles/
    if str(username).isdigit():
        url = f"https://steamcommunity.com/profiles/{username}"
    else:
        url = f"https://steamcommunity.com/id/{username}"
        
    headers = {"User-Agent": "Mozilla/5.0"}
    
    import httpx
    import re
    import json
    
    logger.info(f"Triggering native Steam API for {username}...")
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            html = response.text
            
            # Extract g_rgProfileData snippet provided by the user
            match = re.search(r'g_rgProfileData\s*=\s*(\{.*?\});', html)
            if match:
                profile_data = json.loads(match.group(1))
            else:
                profile_data = {}
                
            # Optionally extract avatar
            avatar_match = re.search(r'<div class="playerAvatarAutoSizeInner[^>]*>.*?<img[^>]+srcset=["\']([^"\']+)["\']', html, re.DOTALL | re.IGNORECASE)
            if not avatar_match:
                avatar_match = re.search(r'<div class="playerAvatar[^>]*>.*?<img[^>]+src=["\']([^"\']+)["\']', html, re.DOTALL | re.IGNORECASE)
            avatar_url = avatar_match.group(1).split()[0].replace('_full', '_full').strip() if avatar_match else ""
            
            # Extract Level
            level_match = re.search(r'class="friendPlayerLevelNum">(\d+)</span>', html)
            level = level_match.group(1) if level_match else None
            
            # Extract Location
            location_match = re.search(r'<div class="header_location">(.*?)</div>', html, re.DOTALL)
            location = re.sub(r'<[^>]+>', '', location_match.group(1)).strip() if location_match else None
            if location:
                # remove extra spaces/newlines
                location = re.sub(r'\s+', ' ', location)
            
            # Fetch Aliases properly via Steam's ajax endpoint
            aliases = []
            steam_id = profile_data.get("steamid")
            if steam_id:
                alias_url = f"https://steamcommunity.com/profiles/{steam_id}/ajaxaliases"
                alias_resp = await client.get(alias_url, headers=headers)
                if alias_resp.status_code == 200:
                    try:
                        alias_json = alias_resp.json()
                        if isinstance(alias_json, list):
                            aliases = [item.get("newname") for item in alias_json if isinstance(item, dict) and item.get("newname")]
                    except Exception:
                        pass

            # Extract Recent Activity
            recent_activity_match = re.search(r'class="recentgame_quicklinks recentgame_recentplaytime"[^>]*>\s*<div>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
            recent_activity = recent_activity_match.group(1).strip() if recent_activity_match else None
            if recent_activity:
                recent_activity = re.sub(r'\s+', ' ', recent_activity)

            # Extract Friends Count
            friends_match = re.search(r'<a href="[^"]+/friends/"[^>]*>.*?<span class="profile_count_link_total">\s*([\d,\.]+)\s*</span>', html, re.DOTALL | re.IGNORECASE)
            friends_str = friends_match.group(1).replace(',', '').replace('.', '') if friends_match else "0"
            friends_count = int(friends_str) if friends_str.isdigit() else 0

            # Extract Groups Count
            groups_match = re.search(r'<a href="[^"]+/groups/"[^>]*>.*?<span class="profile_count_link_total">\s*([\d,\.]+)\s*</span>', html, re.DOTALL | re.IGNORECASE)
            groups_str = groups_match.group(1).replace(',', '').replace('.', '') if groups_match else "0"
            groups_count = int(groups_str) if groups_str.isdigit() else 0

            extra = {
                "level": level,
                "location": location,
                "aliases": aliases,
                "recent_activity": recent_activity,
                "friends_count": friends_count,
                "groups_count": groups_count
            }
            
            return {"profile_data": profile_data, "avatar_url": avatar_url, "extra": extra, "all_results": []}
    except Exception as e:
        logger.error(f"Native Steam API failed for {username}: {str(e)}")
        return {"error": str(e)}

async def scrape_pinterest(username: str) -> Dict[str, Any]:
    """
    Uses the Apify Pinterest profile scraper to extract Pinterest profile data.
    """
    if not username:
        return {}
        
    token = get_apify_token()
    if not token:
        logger.warning("APIFY_API_TOKEN is missing. Skipping Pinterest scrape.")
        return {"status": "skipped", "reason": "Missing APIFY_API_TOKEN"}

    client = ApifyClientAsync(token)
    
    pinterest_url = f"https://www.pinterest.com/{username}/"
    
    run_input = {
        "limit": 1,
        "proxyConfiguration": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"]
        },
        "queries": [pinterest_url],
        "startUrls": [pinterest_url],
        "type": "profiles"
    }

    logger.info(f"Triggering Pinterest scraper for {username} via Apify...")
    
    try:
        run = await client.actor("apify/pinterest-scraper").call(run_input=run_input)
        
        results = []
        async for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            results.append(item)
            
        return {"profile_data": results[0] if results else {}, "all_results": results}
    except Exception as e:
        logger.error(f"Apify Pinterest scraper failed: {str(e)}")
        return {"error": str(e)}
