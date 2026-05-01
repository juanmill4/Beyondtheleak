from pydantic import BaseModel, EmailStr, HttpUrl
from typing import Optional

class InvestigateRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    linkedin_url: Optional[HttpUrl] = None

class TaskResponse(BaseModel):
    task_id: str
    status: str

class StatusResponse(BaseModel):
    task_id: str
    status: str
    result: Optional[dict] = None

class SocialScrapeRequest(BaseModel):
    platform: str
    username: str
