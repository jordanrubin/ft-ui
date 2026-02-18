# future tokenizer

graph-based plan-building IDE with cognitive operations.

**canvas is not a claude wrapper. it's a new interface primitive: reasoning-as-graph.**

linear chat forces you to think linearly. canvas lets you branch, stress-test, and refine plans as a visual structure — then execute them.

## the insight

plans are the highest-leverage artifact in agentic coding. a good plan = claude executes well. a bad plan = you watch claude flail for 10 minutes before ctrl-c.

but plan-building in linear text is brutal:
- you can't see the structure
- you can't click into a substep and stress-test it
- you can't branch "what if we did X instead of Y" without losing the original
- you can't cross-link dependencies between steps

future tokenizer fixes this.

## workflow

1. paste rough goal into canvas as root
2. click `@excavate` → assumptions surface as children
3. click an assumption → `@antithesize` → opposition spawns
4. click best path → `@stressify` → failure modes surface
5. iterate until plan feels robust
6. press `x` → execute plan in claude code
7. press `r` → review execution, surface divergence

## operations (10 public skills)

| operation | what it does |
|-----------|--------------|
| @excavate | surface hidden assumptions |
| @antithesize | generate standalone opposition |
| @synthesize | compress conflicting positions |
| @stressify | probe for failure modes |
| @simulate | trace execution forward |
| @diverge | generate alternative approaches |
| @dimensionalize | map to measurable dimensions |
| @negspace | detect what's conspicuously absent |
| @metaphorize | map from familiar domain |
| @rhyme | fast structural similarity |

**39 skills in extended set.** [request access →](https://github.com/jordanrubin/ft-ui/issues/new?title=extended%20skills%20access)

## install

```bash
pip install future-tokenizer
```

or from source:

```bash
git clone https://github.com/jordanrubin/ft-ui
cd ft-ui
pip install -e .
```

## usage

```bash
future-tokenizer                  # new canvas
future-tokenizer my-plan.json     # load existing
```

### keybindings

| key | action |
|-----|--------|
| `q` | quit |
| `s` | save |
| `e` | export plan as markdown |
| `x` | execute plan in claude code |
| `r` | review execution |
| `n` | new canvas |
| `esc` | focus operations |

## requirements

- python 3.11+
- claude code installed and authenticated (`claude` command available)

## license

MIT

---

*built for [future tokens](https://futuretokens.ai)*
