# Dynamic Route Optimization System - Backend

FastAPI backend for real-time logistics route optimization.

## Setup

```bash
pip install -r requirements.txt
python main.py
```

Server runs on `http://localhost:8000`

## API Endpoints

- `GET /` - API info
- `POST /upload/hubs` - Upload hubs CSV
- `POST /upload/trucks` - Upload trucks CSV  
- `GET /state` - Get current world state
- `POST /simulation/start` - Start simulation
- `POST /simulation/stop` - Stop simulation
- `POST /disruptions/{type}` - Toggle disruption
- `POST /hubs` - Add new hub
- `PUT /hubs/{hub_id}/priority` - Update hub priority

