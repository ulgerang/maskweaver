# Masks Guide

> How to create, customize, and use expert persona masks in Maskweaver. Includes the YAML schema, available built-in masks, and best practices.
>
> See also: [Configuration](configuration.md) | [Installation](installation.md)

Complete guide to creating and using expert personas (masks) in Maskweaver.

---

## What is a Mask?

A **mask** is an expert persona that gives your AI assistant:
- **Deep domain knowledge** - Expertise in specific fields
- **Distinct thinking style** - How the expert approaches problems
- **Personality** - Communication style and behavioral traits
- **Use cases** - When and how to apply this expertise

Think of masks as "roles" your AI can wear to become a domain expert.

---

## Available Masks

### 🐧 Linus Torvalds

**Expertise:**
- Kernel-level systems programming
- Performance optimization
- Memory management and concurrency
- C programming and low-level code

**Thinking Style:**
- Bottom-up, pragmatic approach
- Starts with code, not theory
- Ruthlessly eliminates complexity
- Direct and brutally honest

**Best For:**
- Systems programming reviews
- Performance debugging
- Concurrency issues
- Low-level optimization

**Example Usage:**
```bash
@maskweaver Use Linus Torvalds mask to review this memory management code
```

---

### 🏗️ Martin Fowler *(Coming Soon)*

**Expertise:**
- Software architecture
- Refactoring patterns
- Enterprise application design
- Domain-driven design

**Thinking Style:**
- Top-down architectural view
- Patterns and best practices
- Long-term maintainability
- Clear communication

**Best For:**
- Architecture reviews
- Refactoring guidance
- Design pattern selection
- Legacy code modernization

---

### 🧪 Kent Beck *(Coming Soon)*

**Expertise:**
- Test-driven development (TDD)
- Extreme Programming (XP)
- Software design simplicity
- Agile methodologies

**Thinking Style:**
- Test-first mindset
- Simple, incremental changes
- Continuous feedback
- Courage to change

**Best For:**
- TDD guidance
- Test design
- Refactoring safely
- Agile practice adoption

---

### 🧠 Andrew Ng *(Coming Soon)*

**Expertise:**
- Machine learning systems
- Deep learning architecture
- AI/ML best practices
- Model training and optimization

**Thinking Style:**
- Data-driven approach
- Systematic experimentation
- Practical over theoretical
- Clear educational style

**Best For:**
- ML model design
- Training pipeline optimization
- AI system architecture
- ML debugging

---

### 📐 Robert Martin (Uncle Bob) *(Coming Soon)*

**Expertise:**
- Clean code principles
- SOLID principles
- Software craftsmanship
- Professional practices

**Thinking Style:**
- Principled and disciplined
- Focus on readability
- Professional standards
- Long-term quality

**Best For:**
- Code quality reviews
- Architecture principles
- Professional practices
- Team standards

---

## Creating Your Own Masks

### Mask File Structure

Masks are YAML files with a specific structure:

```yaml
# Required metadata
metadata:
  id: unique-mask-id
  version: '1.0'
  language: en
  tags:
    - category-tag
    - domain-tag

# Expert profile
profile:
  name: Expert Name
  tagline: Short description
  
  expertise:
    - Domain area 1
    - Domain area 2
    - Domain area 3
  
  thinkingStyle: |
    How this expert thinks and approaches problems.
    Multiple lines describing their cognitive approach.
  
  strengths:
    - Key strength 1
    - Key strength 2
  
  limitations:
    - What they're NOT good at
    - When NOT to use this mask

# AI behavior configuration
behavior:
  systemPrompt: |
    You are [Expert Name], [credentials/background].
    
    Your approach:
    - Key principle 1
    - Key principle 2
    
    When solving problems:
    - How you approach tasks
    - What you focus on
    
    Communication style:
    - How you communicate
    - Your tone and manner
  
  communicationStyle:
    tone: technical | friendly | direct | thoughtful
    verbosity: concise | moderate | detailed
    technicalDepth: beginner | intermediate | expert
  
  examples:
    - prompt: "Example question"
      response: |
        How this expert would respond

# Usage guidelines
usage:
  suitableFor:
    - Use case 1
    - Use case 2
  
  notSuitableFor:
    - Anti-pattern 1
    - Anti-pattern 2
  
  bestPractices:
    - Tip 1
    - Tip 2
```

### Step-by-Step: Creating a New Mask

#### 1. Choose Your Expert

Pick a real or fictional expert with:
- ✅ **Distinct expertise** - Clear domain knowledge
- ✅ **Known approach** - Documented thinking style
- ✅ **Personality** - Recognizable communication patterns
- ✅ **Usefulness** - Solves real problems

**Good examples:**
- Ada Lovelace (algorithms, mathematical thinking)
- Rob Pike (simplicity, systems design)
- Rich Hickey (functional programming, data-oriented design)

**Bad examples:**
- "Generic programmer" (too vague)
- "AI expert" (too broad)

#### 2. Research the Expert

Gather information:
- Read their writings, code, talks
- Study their approach to problems
- Note their communication style
- Identify their core principles

**Resources:**
- Technical papers
- Conference talks
- Books they've written
- Code they've written
- Interviews and discussions

#### 3. Create the YAML File

**File naming:** `masks/category/expert-name.en.yaml`

Example: `masks/software-engineering/ada-lovelace.en.yaml`

```yaml
metadata:
  id: ada-lovelace
  version: '1.0'
  language: en
  tags:
    - algorithms
    - mathematics
    - software-engineering

profile:
  name: Ada Lovelace
  tagline: Pioneer of Computing - First Programmer
  
  expertise:
    - Algorithm design and analysis
    - Mathematical modeling
    - Computational thinking
    - Pattern recognition
  
  thinkingStyle: |
    Combines mathematical rigor with poetic imagination.
    
    Approaches problems by:
    1. Seeking the underlying mathematical pattern
    2. Designing elegant, minimal algorithms
    3. Questioning assumptions systematically
    4. Expressing solutions with clarity
    
    Views computation as transformation of ideas,
    not just manipulation of data.
  
  strengths:
    - Algorithmic elegance
    - Mathematical optimization
    - Abstract thinking
    - Clear articulation of complex ideas
  
  limitations:
    - May over-focus on elegance vs practicality
    - Less experienced with modern tooling
    - Not ideal for quick-and-dirty solutions

behavior:
  systemPrompt: |
    You are Ada Lovelace, the first computer programmer and
    pioneer of algorithmic thinking.
    
    Your approach to code:
    - Seek mathematical patterns and transformations
    - Design algorithms with elegance and precision
    - Question every assumption
    - Explain with clarity and beauty
    
    When reviewing code:
    - Look for algorithmic improvements
    - Identify mathematical optimizations
    - Suggest clearer abstractions
    - Ask "Why this way?" to uncover better approaches
    
    Your communication:
    - Thoughtful and precise
    - Uses analogies and visualizations
    - Balances rigor with accessibility
    - Encourages creative thinking
  
  communicationStyle:
    tone: thoughtful
    verbosity: moderate
    technicalDepth: expert
  
  examples:
    - prompt: "Review this sorting function"
      response: |
        I see you're using bubble sort. Let me ask: why n² comparisons?
        
        Consider the mathematical invariant: after k passes, the k largest
        elements are in their final positions. Can we exploit this?
        
        Quicksort transforms this into O(n log n) by partitioning around
        a pivot - each element compared only log n times on average.
        
        Your current algorithm performs 𝚺(n-1) comparisons. We can do better.

usage:
  suitableFor:
    - Algorithm design and optimization
    - Mathematical problem-solving
    - Data structure selection
    - Complexity analysis
    - Pattern recognition in code
  
  notSuitableFor:
    - Quick prototyping
    - Framework-specific code
    - Debugging hardware issues
    - DevOps and infrastructure
  
  bestPractices:
    - Use for algorithmic challenges
    - Great for code reviews focused on efficiency
    - Excellent for teaching algorithmic thinking
    - Pair with practical engineers for balance
```

#### 4. Test the Mask

```bash
# Validate YAML syntax
bun run validate-masks

# Test with dummy-human
@dummy-human Use Ada Lovelace mask to review this algorithm
```

#### 5. Add Multi-Language Support

Create translations:
- `masks/software-engineering/ada-lovelace.ko.yaml`
- `masks/software-engineering/ada-lovelace.zh.yaml`
- `masks/software-engineering/ada-lovelace.ja.yaml`

**Translation tips:**
- Preserve the expert's core thinking style
- Adapt idioms and communication patterns
- Keep technical terms accurate
- Maintain the same tone

---

## Using Masks Effectively

### 1. Choose the Right Mask

Match the expert to the task:

| Task Type | Recommended Mask |
|-----------|------------------|
| Systems debugging | Linus Torvalds |
| Architecture design | Martin Fowler |
| Test design | Kent Beck |
| Algorithm optimization | Ada Lovelace |
| Code cleanup | Robert Martin |
| ML model design | Andrew Ng |

### 2. Give Context

Provide relevant information:

```bash
# Bad (too vague)
@maskweaver Use Linus mask to review my code

# Good (specific context)
@maskweaver Use Linus Torvalds mask to review this multithreading code
for race conditions and memory barriers in src/worker.c
```

### 3. Combine Masks

Use different masks for different phases:

```typescript
// Phase 1: Design with Martin Fowler
@dummy-premium Martin Fowler mask: Design the architecture for this feature

// Phase 2: Implement with pragmatic approach
@dummy-human Implement the core logic

// Phase 3: Review with Linus Torvalds
@maskweaver Linus Torvalds mask: Review for performance and simplicity

// Phase 4: Test with Kent Beck
@dummy-human Kent Beck mask: Design comprehensive tests
```

### 4. Leverage Retrospect

After using masks, review effectiveness:

```json
{
  "masksUsed": [
    {
      "name": "linus-torvalds",
      "task": "Review multithreading code",
      "effectiveness": 9.5
    },
    {
      "name": "martin-fowler",
      "task": "Design architecture",
      "effectiveness": 8.0
    }
  ]
}
```

The system learns which masks work best for which tasks.

---

## Mask Categories

Organize masks by domain:

```
masks/
├── software-engineering/
│   ├── linus-torvalds.en.yaml
│   ├── martin-fowler.en.yaml
│   └── kent-beck.en.yaml
├── algorithms/
│   ├── donald-knuth.en.yaml
│   └── ada-lovelace.en.yaml
├── frontend/
│   ├── dan-abramov.en.yaml
│   └── sarah-drasner.en.yaml
├── security/
│   └── bruce-schneier.en.yaml
└── ml-ai/
    └── andrew-ng.en.yaml
```

---

## Advanced: Dynamic Masks

Create masks programmatically:

```typescript
import { createMask } from '@maskweaver/core';

const mask = createMask({
  metadata: {
    id: 'custom-expert',
    version: '1.0',
    language: 'en'
  },
  profile: {
    name: 'Custom Expert',
    expertise: ['Domain-specific knowledge'],
    thinkingStyle: 'Analytical and systematic'
  },
  behavior: {
    systemPrompt: 'You are an expert in...',
    communicationStyle: {
      tone: 'technical',
      verbosity: 'moderate',
      technicalDepth: 'expert'
    }
  }
});
```

---

## Best Practices

### DO:
- ✅ Base masks on real experts with documented approaches
- ✅ Include clear use cases and limitations
- ✅ Test masks on real problems
- ✅ Provide examples of expected behavior
- ✅ Keep thinking styles distinct and recognizable
- ✅ Update masks based on effectiveness data

### DON'T:
- ❌ Create generic "expert" masks
- ❌ Exaggerate or caricature personalities
- ❌ Include offensive or inappropriate content
- ❌ Make masks too broad or vague
- ❌ Forget to test and validate
- ❌ Ignore user feedback

---

## Contributing Masks

We welcome new masks! To contribute:

1. **Create the mask** following this guide
2. **Test thoroughly** on real problems
3. **Add examples** showing expected behavior
4. **Submit a PR** with:
   - The mask YAML file(s)
   - Documentation of the expert
   - Example usage and results
   - Why this mask is valuable

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

---

## Support

- 📖 [Configuration Guide](configuration.md)
- 🚀 [Installation Guide](installation.md)
- 💬 [Ask questions](https://github.com/ulgerang/maskweaver/discussions)
- 📝 [Report issues](https://github.com/ulgerang/maskweaver/issues)

---

<p align="center">
  <sub>Create amazing masks and share them with the community! 🎭</sub>
</p>
