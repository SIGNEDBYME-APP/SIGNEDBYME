"""
SignedByMe Demo API

Standalone demo service for the "Authorize Your Agent" demo on signedbyme.com.
This service is separate from production — production API code is untouched.

Endpoints:
- POST /v1/demo/login - Enterprise login simulation
- POST /v1/demo/start/{session_id} - Start genesis flow
- POST /v1/demo/gate1-complete/{session_id} - Complete Gate 1
- POST /v1/demo/gate2-complete/{session_id} - Complete Gate 2
- GET /v1/demo/status/{session_id} - Poll flow status
- POST /v1/demo/verify/{session_id} - Complete login verification
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import demo
from .routes import login
from .routes import membership
from .routes import enroll

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("demo")

# App
app = FastAPI(
    title="SignedByMe Demo API",
    description="Standalone demo service for the Authorize Your Agent demo",
    version="1.0.0",
)

# CORS - allow demo website
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://signedbyme.com",
        "https://www.signedbyme.com",
        "http://localhost:3000",  # Local dev
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(demo.router)
app.include_router(login.router)
app.include_router(membership.router)
app.include_router(enroll.router)


@app.get("/")
def root():
    """Health check."""
    return {
        "service": "SignedByMe Demo API",
        "status": "ok",
        "version": "1.0.0",
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
