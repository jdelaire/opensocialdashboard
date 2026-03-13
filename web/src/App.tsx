import { Route, Routes } from "react-router-dom";
import { AccountPage } from "./pages/AccountPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";

export default function App(): JSX.Element {
  return (
    <div className="container app-shell">
      <header className="app-header app-hero">
        <div className="hero-copy">
          <p className="eyebrow">Open Social Dashboard</p>
          <h1>Follower Tracking, Simplified</h1>
          <p className="subtitle">Daily follower and subscriber snapshots from public profile URLs, presented with a cleaner signal-first view.</p>
        </div>
        <div className="hero-aside">
          <div className="hero-badge">Premium Minimal Monitoring</div>
          <p className="hero-note">Watch the accounts that matter, catch failures quickly, and keep the interface calm enough to scan in seconds.</p>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/accounts/:id" element={<AccountPage />} />
      </Routes>
    </div>
  );
}
