"""AWS Lambda entrypoint for the FastAPI application."""

from mangum import Mangum

from app.main import app

# API Gateway HTTP API invokes this handler. Lifespan is unnecessary because the
# application owns no startup or shutdown resources.
handler = Mangum(app, lifespan="off")
