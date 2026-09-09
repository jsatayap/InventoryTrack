from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth_router, products, locations, invoices, receive, issues, stock

app = FastAPI(title="Smartphone Inventory API")

# Allow the Next.js dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(products.router)
app.include_router(locations.router)
app.include_router(invoices.router)
app.include_router(receive.router)
app.include_router(issues.router)
app.include_router(stock.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}