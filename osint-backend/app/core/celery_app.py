import os
from celery import Celery

# Redis URL will be fetched from env or default to local docker instance
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "osint_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.worker.tasks"]
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    # Expire results quickly (e.g., 1 hour) to keep the backend stateless
    result_expires=3600,
    broker_connection_retry_on_startup=True,
)
