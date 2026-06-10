
import express from "express"
import cors from "cors";
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.get("/", (req, res) => {
    res.send({
        "status": "ok",
    })
});

app.get("/health", (req, res) => {
    res.send({
        "status": "healthy",
    })
});

// Add test endpoint
app.post("/api/test", (req, res) => {
    res.json({ message: "Test endpoint working", body: req.body });
});

export default app;