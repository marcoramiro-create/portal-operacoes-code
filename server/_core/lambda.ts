import express from "express";

const app = express();

app.use(express.json({ limit: "75mb" }));

app.use((req, res) => {
  res.status(200).json({ 
    ok: true, 
    message: "Lambda minimal is alive",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

export default app;