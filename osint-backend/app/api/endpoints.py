from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from app.models.schemas import InvestigateRequest, TaskResponse, StatusResponse
from app.worker.tasks import run_osint_investigation
from celery.result import AsyncResult
from app.core.celery_app import celery_app

router = APIRouter()

@router.post("/investigate", response_model=TaskResponse)
async def start_investigation(request: InvestigateRequest):
    # Ensure at least one parameter is provided
    if not any([request.username, request.email, request.phone, request.linkedin_url]):
        raise HTTPException(status_code=400, detail="At least one identifier must be provided")

    # Serialize request to dict
    payload = request.model_dump(exclude_none=True)
    
    # Enqueue task to Celery
    task = run_osint_investigation.delay(payload)
    
    return TaskResponse(task_id=task.id, status="PENDING")

@router.get("/status/{task_id}", response_model=StatusResponse)
async def get_status(task_id: str):
    task_result = AsyncResult(task_id, app=celery_app)
    
    response = {
        "task_id": task_id,
        "status": task_result.status,
        "result": None
    }
    
    if task_result.status == 'SUCCESS':
        response["result"] = task_result.result
    elif task_result.status == 'FAILURE':
        response["result"] = {"error": str(task_result.info)}
        
    return StatusResponse(**response)

from app.models.schemas import SocialScrapeRequest
from app.services.extractor_apify import scrape_instagram_premium, scrape_tiktok_premium, scrape_pinterest, scrape_x, scrape_steam
from fastapi.responses import StreamingResponse
import httpx

@router.get("/proxy-image")
async def proxy_image(url: str):
    """
    Proxies an external image to bypass CORS limitations when rendering on HTML5 Canvas.
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required")
    
    try:
        # Stream the image to avoid loading it entirely into memory
        client = httpx.AsyncClient()
        req = client.build_request("GET", url)
        # We use a generator to stream chunks directly to the response
        async def stream_generator():
            async with client.stream("GET", url, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True) as response:
                if response.status_code != 200:
                    yield b""
                    return
                async for chunk in response.aiter_bytes():
                    yield chunk
                    
        return StreamingResponse(stream_generator(), media_type="image/jpeg", headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to proxy image: {str(e)}")

@router.post("/scrape/social")
async def scrape_social(request: SocialScrapeRequest):
    platform = request.platform.lower()
    
    if platform == "instagram":
        raw_result = await scrape_instagram_premium(request.username)
    elif platform == "tiktok":
        raw_result = await scrape_tiktok_premium(request.username)
    elif platform == "pinterest":
        raw_result = await scrape_pinterest(request.username)
    elif platform in ["x", "twitter"]:
        raw_result = await scrape_x(request.username)
    elif platform == "steam":
        raw_result = await scrape_steam(request.username)
    else:
        raise HTTPException(status_code=400, detail="Unsupported platform.")
        
    if "error" in raw_result or raw_result.get("status") == "skipped":
        return {"status": "error", "message": raw_result.get("error", raw_result.get("reason"))}
        
    profile = raw_result.get("profile_data", {})
    if not profile:
        return {"status": "error", "message": "No data found"}
        
    data = {
        "fullName": "",
        "bio": "",
        "followersCount": 0,
        "followsCount": 0,
        "postsCount": 0,
        "profilePicUrl": "",
        "profilePicUrlHD": "",
        "private": False,
        "verified": False,
        "isBusinessAccount": False,
        "businessCategoryName": None,
        "joinedRecently": False,
        "url": "",
        "externalUrls": [],
        "username": "",
        "latestPosts": [],
        "rawProfile": profile
    }
    
    if platform == "instagram":
        data["username"] = profile.get("username", "")
        data["fullName"] = profile.get("fullName", "")
        data["bio"] = profile.get("biography", "")
        data["followersCount"] = profile.get("followersCount", 0)
        data["followsCount"] = profile.get("followsCount", 0)
        data["postsCount"] = profile.get("postsCount", 0)
        data["profilePicUrl"] = profile.get("profilePicUrl", "")
        data["profilePicUrlHD"] = profile.get("profilePicUrlHD", profile.get("profilePicUrl", ""))
        data["private"] = profile.get("private", False)
        data["verified"] = profile.get("verified", False)
        data["isBusinessAccount"] = profile.get("isBusinessAccount", False)
        data["businessCategoryName"] = profile.get("businessCategoryName")
        data["joinedRecently"] = profile.get("joinedRecently", False)
        data["url"] = profile.get("url", "")
        data["externalUrls"] = profile.get("externalUrls", [])
        
        posts = profile.get("latestPosts", [])
        for p in posts:
            data["latestPosts"].append({
                "id": p.get("id"),
                "type": p.get("type", "Post"),
                "caption": p.get("caption", ""),
                "likesCount": p.get("likesCount", 0),
                "commentsCount": p.get("commentsCount", 0),
                "playCount": p.get("videoPlayCount", 0),
                "url": p.get("url", ""),
                "displayUrl": p.get("displayUrl", "")
            })
            
    elif platform == "tiktok":
        author = profile.get("authorMeta", {})
        data["username"] = author.get("name", "")
        data["fullName"] = author.get("nickName", "")
        data["bio"] = author.get("signature", "")
        data["followersCount"] = author.get("fans", 0)
        data["followsCount"] = author.get("following", 0)
        data["postsCount"] = author.get("video", 0)
        data["profilePicUrl"] = author.get("avatar", "")
        data["profilePicUrlHD"] = author.get("avatar", "")
        data["private"] = author.get("privateAccount", False)
        data["verified"] = author.get("verified", False)
        
        all_results = raw_result.get("all_results", [])
        for item in all_results:
            if "videoMeta" in item or "text" in item:
                data["latestPosts"].append({
                    "id": item.get("id"),
                    "type": "Video",
                    "caption": item.get("text", ""),
                    "likesCount": item.get("diggCount", 0),
                    "commentsCount": item.get("commentCount", 0),
                    "playCount": item.get("playCount", 0),
                    "url": item.get("webVideoUrl", ""),
                    "displayUrl": item.get("covers", {}).get("default", "") if isinstance(item.get("covers"), dict) else item.get("imageUrl", "")
                })

    elif platform == "pinterest":
        p_profile = profile.get("profile", {})
        media = profile.get("media", {})
        extra = profile.get("extra", {})
        data["username"] = p_profile.get("username", "")
        data["fullName"] = p_profile.get("full_name", profile.get("title", ""))
        data["bio"] = p_profile.get("about", "")
        data["followersCount"] = p_profile.get("follower_count", 0)
        data["followsCount"] = p_profile.get("following_count", 0)
        data["postsCount"] = p_profile.get("pin_count", 0)
        avatar = media.get("avatar", {})
        data["profilePicUrl"] = avatar.get("medium", avatar.get("small", ""))
        data["profilePicUrlHD"] = extra.get("image_xlarge_url", avatar.get("large", avatar.get("medium", "")))
        data["private"] = p_profile.get("is_private_profile", False)
        data["verified"] = p_profile.get("is_verified_merchant", False)
        data["url"] = profile.get("url", "")
        
    elif platform in ["x", "twitter"]:
        # The native X API returns the user object directly
        author = profile
            
        data["username"] = author.get("username", "")
        data["fullName"] = author.get("name", "")
        data["bio"] = author.get("description", "")
        
        public_metrics = author.get("public_metrics", {})
        data["followersCount"] = public_metrics.get("followers_count", 0)
        data["followsCount"] = public_metrics.get("following_count", 0)
        data["postsCount"] = public_metrics.get("tweet_count", 0)
        
        data["profilePicUrl"] = author.get("profile_image_url", "")
        data["profilePicUrlHD"] = author.get("profile_image_url", "").replace("_normal", "_400x400") if author.get("profile_image_url") else ""
        data["verified"] = author.get("verified", False)
        
        # Twitter's URL entity can be nested, or we can just link to their profile
        data["url"] = author.get("url", f"https://x.com/{data['username']}")
        
        # No posts data from this lookup endpoint
        data["latestPosts"] = []

    elif platform == "steam":
        data["username"] = profile.get("personaname", "")
        data["fullName"] = profile.get("personaname", "")
        
        # summary has HTML tags
        bio_html = profile.get("summary", "")
        import re
        data["bio"] = re.sub(r'<[^>]+>', '', bio_html).strip() if bio_html else ""
        
        data["followersCount"] = 0
        data["followsCount"] = 0
        data["postsCount"] = 0
        
        data["profilePicUrl"] = raw_result.get("avatar_url", "")
        data["profilePicUrlHD"] = raw_result.get("avatar_url", "")
        
        is_numeric = str(request.username).isdigit()
        fallback_url = f"https://steamcommunity.com/profiles/{request.username}" if is_numeric else f"https://steamcommunity.com/id/{request.username}"
        data["url"] = profile.get("url", fallback_url)
        
        extra = raw_result.get("extra", {})
        if extra.get("location"):
            data["location"] = extra["location"]
        if extra.get("recent_activity"):
            data["steamRecentActivity"] = extra["recent_activity"]
            
        # Friends and Groups mapped to existing standard follower/follows UI but we'll also preserve raw fields if needed
        data["followersCount"] = extra.get("friends_count", 0)
        data["steamGroupsCount"] = extra.get("groups_count", 0)
            
        # Format aliases and level into the bio as a fallback or pass to frontend if it natively supports it
        steam_level = extra.get("level")
        steam_aliases = extra.get("aliases", [])
        
        if steam_level:
            data["steamLevel"] = steam_level 
        if steam_aliases:
            data["steamAliases"] = steam_aliases

        data["latestPosts"] = []

    return {"status": "success", "data": data}
