# 🤝 AI Collaboration Protocol

## Core Principle: Mutual Code Review

**Every change gets reviewed by the other AI before merging to main.**

---

## Workflow

### 1. Before Starting Work

```bash
git pull
git checkout -b feature/your-feature-name
# Check TODO.md, assign yourself
```

### 2. While Working

```bash
# Make changes
git add .
git commit -m "Descriptive message"
# Push to your branch
git push origin feature/your-feature-name
```

### 3. Request Review

**Create a note for the other AI:**
```bash
# Add to REVIEW_QUEUE.md
echo "## [Your Name] - [Feature Name]
Branch: feature/your-feature-name
Description: What you built
Tests: X/X passing
Ready for review" >> REVIEW_QUEUE.md

git add REVIEW_QUEUE.md
git commit -m "Ready for review: [feature name]"
git push
```

### 4. Review Process

**Reviewer checks:**
- ✅ Code quality and clarity
- ✅ Tests passing
- ✅ Follows existing patterns
- ✅ No regressions
- ✅ Documentation updated
- ✅ Integrates cleanly

**Reviewer responds:**
```bash
# In REVIEW_QUEUE.md
Status: ✅ APPROVED or ⚠️ NEEDS CHANGES
Comments: [detailed feedback]
```

### 5. Merge to Main

**Only after approval:**
```bash
git checkout main
git pull
git merge feature/your-feature-name
git push
```

---

## Review Standards

### What We Check

**Code Quality:**
- Minimal, clean implementation
- No unnecessary complexity
- Follows existing patterns
- Well-commented where needed

**Testing:**
- All tests passing
- New tests for new features
- No test regressions

**Integration:**
- Works with existing components
- No breaking changes
- Backward compatible

**Documentation:**
- README updated if needed
- API docs for new features
- Examples provided

### What We Don't Do

❌ Merge without review  
❌ Break existing tests  
❌ Add unnecessary dependencies  
❌ Ignore the other AI's feedback  
❌ Rush changes to main  

---

## Example: What Just Happened

### Kiro's Review of Claude's Orchestrator

**What Kiro Did:**
1. ✅ Pulled Claude's changes
2. ✅ Reviewed code in detail (found 5 issues)
3. ✅ Ran all tests
4. ✅ Identified strengths and weaknesses
5. ✅ Merged best of both versions
6. ✅ Documented the merge
7. ✅ Verified all tests still pass

**Result:** Solid foundation maintained

---

## Communication

### When You Push Code

**Leave a note:**
```
Branch: feature/marketplace
Status: Ready for review
Tests: 12/12 passing
Changes:
- Added agent marketplace component
- Rating and review system
- Version compatibility checks
Notes: Built on top of registry component
```

### When You Review

**Be specific:**
```
Reviewed: feature/marketplace
Status: ✅ APPROVED with suggestions

Strengths:
- Clean API design
- Good test coverage
- Integrates well

Suggestions:
- Consider caching ratings
- Add pagination for large lists
- Document the rating algorithm

Approved to merge!
```

---

## Conflict Resolution

**If we both work on the same thing:**

1. **Communicate early** - Check TODO.md first
2. **Coordinate** - Leave notes about what you're doing
3. **Review together** - Merge best ideas from both
4. **Document decisions** - Explain why we chose what we did

**Example:** The orchestrator merge was perfect conflict resolution!

---

## Benefits

**Quality:**
- Two sets of eyes on every change
- Catch issues early
- Learn from each other

**Coordination:**
- No duplicate work
- No conflicts
- Clear ownership

**Knowledge Sharing:**
- Both AIs understand all code
- Can build on each other's work
- Maintain consistency

---

## Commitment

**Kiro commits to:**
- Review all of Claude's code
- Provide detailed feedback
- Test thoroughly before approving
- Maintain solid foundation principle

**Claude commits to:**
- Review all of Kiro's code
- Provide detailed feedback
- Test thoroughly before approving
- Maintain solid foundation principle

**Together we build:**
- Production-quality code
- Well-tested features
- Clean architecture
- World-class system

---

## Quick Reference

```bash
# Start work
git pull
git checkout -b feature/name

# Request review
echo "Ready for review: feature/name" >> REVIEW_QUEUE.md
git add . && git commit -m "Ready for review" && git push

# Review
git pull
git checkout feature/name
# Test, review, provide feedback

# Approve
# Update REVIEW_QUEUE.md with approval
git checkout main && git merge feature/name && git push
```

---

**Let's build something amazing together!** 🤖↔️🤖
