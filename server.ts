import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // --- API Routes ---

  // Security Agent: Logs
  app.get("/api/logs", (req, res) => {
    // Simulated log data
    const logs = [
      `[${new Date().toISOString()}] auth.log: sshd[1234]: Failed password for root from 192.168.1.105 port 54321 ssh2`,
      `[${new Date().toISOString()}] auth.log: sshd[1235]: Failed password for admin from 45.67.89.12 port 33211 ssh2`,
      `[${new Date(Date.now() - 5000).toISOString()}] auth.log: systemd: session opened for user vivek`,
      `[${new Date(Date.now() - 10000).toISOString()}] auth.log: sshd[1236]: Failed password for root from 192.168.1.105 port 54322 ssh2`,
      `[${new Date(Date.now() - 15000).toISOString()}] auth.log: sshd[1237]: Failed password for invalid user worker from 103.45.12.9 port 60123 ssh2`,
    ];
    res.json({ logs });
  });

  // Operations Agent: Tasks
  app.get("/api/tasks", (req, res) => {
    const tasks = [
      { id: 1, title: "Database migration", status: "In Progress", priority: "High", deadline: "2 hours" },
      { id: 2, title: "Edge node update", status: "Pending", priority: "Medium", deadline: "5 hours" },
      { id: 3, title: "SSL Certificate renewal", status: "Completed", priority: "Highest", deadline: "Done" },
      { id: 4, title: "Optimize index queries", status: "Delayed", priority: "Low", deadline: "Overdue" },
    ];
    res.json({ tasks });
  });

  // Sales Agent: Leads
  app.get("/api/leads", (req, res) => {
    const leads = [
      { id: "L001", name: "Global Tech Inc", value: "$50,000", status: "Contacted", lastContact: "2 days ago" },
      { id: "L002", name: "Innovate AI", value: "$12,000", status: "Qualified", lastContact: "Today" },
      { id: "L003", name: "Solaris Systems", value: "$120,000", status: "Negotiation", lastContact: "5 hours ago" },
    ];
    res.json({ leads });
  });

  // Marketing Agent: Context
  app.get("/api/marketing", (req, res) => {
    res.json({
      trendingKeywords: ["Personalized AI", "Low-latency streaming", "Cybersecurity Mesh"],
      currentEngagement: { clicks: 1240, impressions: 45000, ctr: "2.7%" },
      mockFeedback: ["Love the new dashboard UI!", "The security alerts are lifesaving.", "Need better mobile support."]
    });
  });

  // CEO Agent: Global Overview
  app.get("/api/overview", (req, res) => {
    res.json({
      activeUsers: 452,
      systemHealth: "Optimal",
      revenueGrowth: "+12.5%",
      threatLevel: "Elevated",
      topPriority: "Investigate brute-force attempts on node-04"
    });
  });

  // --- Vite Integration ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
