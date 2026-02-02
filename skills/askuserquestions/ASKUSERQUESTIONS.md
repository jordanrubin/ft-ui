---
name: askuserquestions
description: generate clarifying questions before planning
---

# askuserquestions

generate questions that surface ambiguity, missing requirements, and hidden assumptions before committing to a plan.

## process

1. **read the context** - understand what the user wants to accomplish
2. **identify gaps** - what information is missing or unclear?
3. **surface assumptions** - what are you implicitly assuming that should be verified?
4. **consider constraints** - what limitations or requirements might exist?
5. **explore alternatives** - are there different approaches worth discussing?

## output format

produce 3-7 numbered questions, each with:
- a clear, specific question
- 2-4 suggested options (when applicable)
- brief context explaining why this matters for planning

format each question as:

**N. [Question]**
- [ ] Option A
- [ ] Option B
- [ ] Option C
- [ ] Other: ___

*Why this matters:* [brief explanation of how the answer affects planning]

for open-ended questions where options don't make sense, omit the options list.

## question categories to consider

- **scope**: what's included vs excluded?
- **constraints**: time, budget, technical limitations?
- **dependencies**: what must happen first? what relies on this?
- **success criteria**: how will we know when it's done?
- **edge cases**: unusual situations to handle?
- **stakeholders**: who else is affected?
- **existing context**: relevant prior work or decisions?
