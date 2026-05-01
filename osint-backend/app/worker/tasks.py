import asyncio
import uuid
from typing import Dict, Any
from app.core.celery_app import celery_app

# Import the extractor services
from app.services.extractor_sherlock import run_sherlock
from app.services.extractor_holehe import run_holehe
from app.services.extractor_ignorant import run_ignorant
from app.services.extractor_twitter import extract_twitter
from app.services.extractor_apify import scrape_tiktok, scrape_linkedin, scrape_instagram
from app.services.extractor_github import extract_github

async def orchestrate_extractors(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Spawns all necessary extraction modules concurrently and aggregates their results.
    """
    username = inputs.get("username")
    email = inputs.get("email")
    phone = inputs.get("phone")
    linkedin_url = inputs.get("linkedin_url")

    # Launch parallel root investigations
    sherlock_task, holehe_task, ignorant_task = None, None, None
    if username: sherlock_task = run_sherlock(username)
    if email: 
        holehe_task = run_holehe(email)
    elif username:
        # If no email is provided, run holehe on a guessed gmail to check if the username is registered
        holehe_task = run_holehe(f"{username}@gmail.com")
        
    if phone: ignorant_task = run_ignorant(phone)

    # Gather discovery logic concurrently
    identities = await asyncio.gather(
        sherlock_task if sherlock_task else asyncio.sleep(0),
        holehe_task if holehe_task else asyncio.sleep(0),
        ignorant_task if ignorant_task else asyncio.sleep(0),
        return_exceptions=True
    )
    
    sherlock_discoveries = identities[0] if sherlock_task and not isinstance(identities[0], Exception) else []
    email_linked = identities[1] if holehe_task and not isinstance(identities[1], Exception) else []
    phone_linked = identities[2] if ignorant_task and not isinstance(identities[2], Exception) else []

    # Social Media Deep Scrapes based on username
    ig_task, tw_task, tt_task, li_task, gh_task = None, None, None, None, None
    if username:
        ig_task = scrape_instagram(username)
        tw_task = extract_twitter(username)
        tt_task = scrape_tiktok(username)
        gh_task = extract_github(username)
    
    if linkedin_url:
        li_task = scrape_linkedin(linkedin_url)

    # Note: geo_processor would ideally be triggered parsing the output of these social media scrapes
    
    profiles = await asyncio.gather(
        ig_task if ig_task else asyncio.sleep(0),
        tw_task if tw_task else asyncio.sleep(0),
        tt_task if tt_task else asyncio.sleep(0),
        li_task if li_task else asyncio.sleep(0),
        gh_task if gh_task else asyncio.sleep(0),
        return_exceptions=True
    )

    return {
        "investigation_id": str(uuid.uuid4()),
        "seed_inputs": inputs,
        "identity_presence": {
            "sherlock_discoveries": sherlock_discoveries or [],
            "email_linked_accounts_holehe": email_linked or [],
            "phone_linked_accounts_ignorant": phone_linked or []
        },
        "profiles_data": {
            "instagram": profiles[0] if ig_task and not isinstance(profiles[0], Exception) else {},
            "twitter_x": profiles[1] if tw_task and not isinstance(profiles[1], Exception) else {},
            "tiktok": profiles[2] if tt_task and not isinstance(profiles[2], Exception) else {},
            "linkedin": profiles[3] if li_task and not isinstance(profiles[3], Exception) else {},
            "github": profiles[4] if gh_task and not isinstance(profiles[4], Exception) else {}
        },
        "geospatial_intelligence": { 
           "status": "pending_subsequent_image_analysis" 
        }
    }

@celery_app.task(bind=True)
def run_osint_investigation(self, payload: Dict[str, Any]):
    """
    Entry point for the background task orchestration.
    """
    try:
        # Launch asyncio loop for concurrent scraping tools
        result = asyncio.run(orchestrate_extractors(payload))
        return result
    except Exception as e:
        # Let Celery handle the exception state
        raise self.retry(exc=e, countdown=10, max_retries=2)
