import app from "./app.js";
import connect from "./connect.js";
import dotenv from "dotenv";

dotenv.config({ override: true });

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

connect(process.env.MONGO_URI)
    .then(() => {
        console.log(` MongoDB Connected`);

        const server = app.listen(PORT, HOST, () => {
            console.log(`Server started successfully at http://${HOST}:${PORT}`);
        });

        server.on('error', (error) => {
            console.error(' Server error:', error);
        });
    })
    .catch((error) => {
        console.error(" MongoDB connection error:", error);
    });