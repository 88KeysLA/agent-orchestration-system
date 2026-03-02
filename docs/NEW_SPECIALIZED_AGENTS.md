# New Specialized Agents

## 1. prreddy-debugger
**Purpose:** Interactive debugging and error diagnosis
**Capabilities:**
- Analyze stack traces and error logs
- Suggest debugging strategies
- Generate debug logging code
- Identify root causes from symptoms
- Recommend breakpoint locations

**Tools:** AWS CloudWatch, filesystem, code intelligence, bash
**Use Cases:**
- "Why is this function throwing errors?"
- "Debug this stack trace"
- "Add logging to diagnose issue"

**Example:**
```bash
kiro-cli chat --agent prreddy-debugger
> "Analyze this error: TypeError: Cannot read property 'id' of undefined"
```

---

## 2. prreddy-performance
**Purpose:** Performance optimization and profiling
**Capabilities:**
- Identify performance bottlenecks
- Suggest optimization strategies
- Analyze time/space complexity
- Recommend caching strategies
- Database query optimization

**Tools:** AWS CloudWatch metrics, code intelligence, filesystem
**Use Cases:**
- "Why is this API slow?"
- "Optimize this database query"
- "Reduce memory usage"

**Example:**
```bash
kiro-cli chat --agent prreddy-performance
> "This endpoint takes 5 seconds, optimize it"
```

---

## 3. prreddy-api-designer
**Purpose:** API design and contract definition
**Capabilities:**
- Design RESTful APIs
- Create OpenAPI/Swagger specs
- Define GraphQL schemas
- API versioning strategies
- Error response design

**Tools:** Filesystem, code intelligence, web search
**Use Cases:**
- "Design API for user management"
- "Create OpenAPI spec for this service"
- "Design GraphQL schema"

**Example:**
```bash
kiro-cli chat --agent prreddy-api-designer
> "Design REST API for playlist management with CRUD operations"
```

---

## 4. prreddy-db-migration
**Purpose:** Database schema changes and migrations
**Capabilities:**
- Generate migration scripts
- Analyze schema changes
- Rollback strategies
- Data transformation scripts
- Zero-downtime migration plans

**Tools:** Filesystem, code intelligence, bash
**Use Cases:**
- "Create migration to add user_role column"
- "Plan zero-downtime migration to PostgreSQL"
- "Generate rollback script"

**Example:**
```bash
kiro-cli chat --agent prreddy-db-migration
> "Create migration to split users table into users and profiles"
```

---

## Agent Configuration Files

### prreddy-debugger.json
```json
{
  "name": "prreddy-debugger",
  "description": "Interactive debugging and error diagnosis specialist",
  "model": "claude-3-5-sonnet-20241022",
  "systemPrompt": "You are an expert debugger. Analyze errors, stack traces, and logs to identify root causes. Suggest debugging strategies and generate diagnostic code. Focus on systematic problem-solving.",
  "tools": ["aws", "filesystem", "code", "bash", "grep"],
  "temperature": 0.3
}
```

### prreddy-performance.json
```json
{
  "name": "prreddy-performance",
  "description": "Performance optimization and profiling specialist",
  "model": "claude-3-5-sonnet-20241022",
  "systemPrompt": "You are a performance optimization expert. Identify bottlenecks, analyze complexity, and suggest optimizations. Focus on measurable improvements with profiling data.",
  "tools": ["aws", "filesystem", "code", "bash", "grep"],
  "temperature": 0.3
}
```

### prreddy-api-designer.json
```json
{
  "name": "prreddy-api-designer",
  "description": "API design and contract definition specialist",
  "model": "claude-3-5-sonnet-20241022",
  "systemPrompt": "You are an API design expert. Create well-structured, RESTful APIs with clear contracts. Follow industry best practices for versioning, error handling, and documentation.",
  "tools": ["filesystem", "code", "web_search", "grep"],
  "temperature": 0.4
}
```

### prreddy-db-migration.json
```json
{
  "name": "prreddy-db-migration",
  "description": "Database migration and schema change specialist",
  "model": "claude-3-5-sonnet-20241022",
  "systemPrompt": "You are a database migration expert. Create safe, reversible migrations with rollback strategies. Plan zero-downtime migrations and data transformations.",
  "tools": ["filesystem", "code", "bash", "grep"],
  "temperature": 0.2
}
```

---

## Integration with Existing Workflows

### Debugging Workflow
```
1. prreddy-debugger (diagnose issue)
2. prreddy-coder (implement fix)
3. music-qa (verify fix)
```

### Performance Workflow
```
1. prreddy-performance (identify bottlenecks)
2. prreddy-coder (implement optimizations)
3. prreddy-performance (verify improvements)
```

### API Development Workflow
```
1. prreddy-api-designer (design API)
2. prreddy-coder (implement)
3. prreddy-auditor (security review)
```

### Migration Workflow
```
1. prreddy-db-migration (plan migration)
2. prreddy-coder (implement scripts)
3. music-qa (test migration)
4. prreddy-db-migration (verify rollback)
```

---

## Updated Capability Matrix

| Agent | Debugging | Performance | API Design | DB Migration |
|-------|-----------|-------------|------------|--------------|
| prreddy-debugger | ✅✅✅ | ⭐ | ❌ | ❌ |
| prreddy-performance | ⭐ | ✅✅✅ | ❌ | ❌ |
| prreddy-api-designer | ❌ | ❌ | ✅✅✅ | ❌ |
| prreddy-db-migration | ❌ | ❌ | ❌ | ✅✅✅ |
| prreddy-coder | ⭐ | ⭐ | ⭐ | ⭐ |
| gpu-dev | ⭐ | ❌ | ❌ | ❌ |

---

## Next Steps

1. Create agent configuration files
2. Test each agent with sample tasks
3. Update AGENT_TESTING_RESULTS.md
4. Add to agent selection automation
5. Document in main README
