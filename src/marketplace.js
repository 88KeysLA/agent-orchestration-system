/**
 * AgentMarketplace - Publish, discover, rate, and install agents
 *
 * Usage:
 *   const market = new AgentMarketplace();
 *   market.publish('my-agent', '1.0.0', agentInstance, { description: '...', strengths: [...] });
 *   market.rate('my-agent', 5, 'Great agent!');
 *   const results = market.search('code');
 *   market.install('my-agent', orchestrator);
 */
class AgentMarketplace {
  constructor() {
    this._listings = new Map(); // name -> { versions, ratings, metadata }
  }

  publish(name, version, agent, metadata = {}) {
    if (!this._listings.has(name)) {
      this._listings.set(name, { versions: new Map(), ratings: [], metadata: {} });
    }
    const listing = this._listings.get(name);
    listing.versions.set(version, agent);
    listing.metadata = { ...listing.metadata, ...metadata, name, updatedAt: Date.now() };
    if (!listing.metadata.publishedAt) listing.metadata.publishedAt = Date.now();
    return this;
  }

  rate(name, score, review = '') {
    if (!this._listings.has(name)) throw new Error(`Agent not found: ${name}`);
    if (score < 1 || score > 5) throw new Error('Score must be 1-5');
    this._listings.get(name).ratings.push({ score, review, ts: Date.now() });
    return this;
  }

  // Search by name, description, or strengths
  search(query = '') {
    const q = query.toLowerCase();
    return Array.from(this._listings.values())
      .filter(({ metadata }) => {
        if (!q) return true;
        const text = [metadata.name, metadata.description, ...(metadata.strengths || [])].join(' ').toLowerCase();
        return text.includes(q);
      })
      .map(({ metadata, ratings, versions }) => ({
        ...metadata,
        versions: [...versions.keys()],
        avgRating: ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null,
        ratingCount: ratings.length
      }))
      .sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
  }

  // Install latest (or specific) version into an orchestrator
  install(name, orchestrator, version) {
    const listing = this._listings.get(name);
    if (!listing) throw new Error(`Agent not found: ${name}`);
    const ver = version || this._latestVersion(listing);
    const agent = listing.versions.get(ver);
    if (!agent) throw new Error(`Version not found: ${ver}`);
    orchestrator.registerAgent(name, ver, agent, listing.metadata);
    return ver;
  }

  // Compare semver strings numerically (handles most common cases)
  _latestVersion(listing) {
    const versions = [...listing.versions.keys()];
    return versions.sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
    }).pop();
  }

  get(name) {
    return this._listings.get(name) || null;
  }

  get size() {
    return this._listings.size;
  }
}

module.exports = AgentMarketplace;
