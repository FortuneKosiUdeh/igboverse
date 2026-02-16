# Dialect Coverage & Geographic Map — Investigation Report

## 1. Why Do Many Beginner Words Have No Dialect Variants?

**Short answer: They don't.** Most common verbs DO have dialect variants. The issue was perception, not reality.

### Verified Data (from live API, 2026-02-14)

**Our app's actual verb pool** (11 keyword searches, `dialects=true`):

| Metric | Count |
|---|---|
| Total verbs fetched | 91 |
| **With dialect variants** | **78 (85%)** |
| Without dialect variants | 13 (15%) |

**Common beginner verbs — ALL have dialect data:**

| English | Standard Igbo | Dialect Variants | Coverage |
|---|---|---|---|
| go | ga | 3 variants | Nsa/Anịọcha/Isuama, Owere/Mkpọọ, Nkanụ |
| give | nye | 6 variants | Nsa/Owere, Nsụka, Ọnịcha, Ezaa/Izii, Afiikpo, Nkanụ |
| love | ịhụ̀naanya | 8 variants | Broad coverage |
| teach | kụzi | 5 variants | Broad coverage |
| buy | zụ | 2 variants | Ọnịcha, Ngwa/Mbaise/Ụmụahịa |
| eat (fill) | riju | 4 variants | Ngwa, Ọnịcha, Abịrịba, Ezaa |
| see | hụ ụzọ̀ | 4 variants | Ọnịcha, Achala, Ngwa, Abịrịba |
| want | chọ | 3 variants | Nsa/Nsụka/Ọnịcha, Mbaise, Anam |
| do | me | 2 variants | Achala, Ọnịcha/Nkanụ |
| chew | ta | 3 variants | Multiple communities |
| say | sị | 2 variants | Ọkụzụ/Afiikpo/Isuama, Ajalị/Owere/Achala |
| run | gba ọsọ | 4 variants | Multiple communities |
| come | bịa | 1 variant | Owere/Nsụka |
| throw | tụbà | 3 variants | Multiple communities |

**Only 2 had zero dialect data**: `know` (returned proper name "Chima"), `learn` (returned noun "ọ̀mụ̀mụ" instead of verb). This is a search matching issue, not missing data.

### Root Cause of the Perceived Gap

The "many words have no dialect variants" misperception had **two causes**:

1. **Fallback verbs had no API data**: Our `FALLBACK_VERBS` array (22 manually-defined verbs like `Ịbụ`, `Ịchọ`, `Ịhapụ`) were created locally without ever querying IgboAPI. They inherently have `dialectVariants: []` because no API call was made for them.

2. **API fetches return rich dialect data**: When we actually call the API with `dialects=true` (which we now do), **85% of returned verbs have dialect variants**. The coverage is strong.

**Conclusion**: The dialect system is working. The API has good dialect coverage for common verbs. There is no parsing bug.

---

## 2. Community Coverage Ranking (Real API Data)

How many word variants each community has in our app's actual verb pool:

| Community | State | Word Variants | Coverage Level |
|---|---|---|---|
| Ọnịcha | Anambra | 52 | ████████████████████ HIGH |
| Ngwa | Abia | 49 | ███████████████████ HIGH |
| Mkpọọ | Abia | 35 | ██████████████ GOOD |
| Owere | Imo | 33 | █████████████ GOOD |
| Mbaise | Imo | 28 | ███████████ GOOD |
| Isuama | Imo | 25 | ██████████ GOOD |
| Achala | Anambra | 23 | █████████ GOOD |
| Ajalị | Anambra | 21 | ████████ GOOD |
| Nkanụ | Enugu | 20 | ████████ MODERATE |
| Nsa | ? | 14 | █████ MODERATE |
| Ụmụahịa | Abia | 14 | █████ MODERATE |
| Nsụka | Enugu | 13 | █████ MODERATE |
| Afiikpo | Ebonyi | 13 | █████ MODERATE |
| Amaifeke | Imo | 13 | █████ MODERATE |
| Abịrịba | Abia | 13 | █████ MODERATE |
| Ezaa | Ebonyi | 12 | ████ MODERATE |
| Obosi | Anambra | 9 | ███ LOW |
| Anịọcha | Anambra | 9 | ███ LOW |
| Ọka | Anambra | 7 | ██ LOW |
| Ihuoma | Imo | 6 | ██ LOW |
| Izii | Ebonyi | 5 | █ LOW |
| Ọkụzụ | Anambra | 4 | █ LOW |
| Ogidi | Anambra | 3 | LOW |
| Ọhụhụ | Abia | 3 | LOW |
| Anam | Anambra | 3 | LOW |

**Key takeaway**: Anambra-area (Ọnịcha) and Abia-area (Ngwa) have the richest dialect coverage. Imo (Owere/Mbaise) is solid. Enugu and Ebonyi have moderate coverage.

---

## 3. Verified Geographic Placement of Dialect Communities

### Research Sources
- Wikipedia (LGA entries for each community)
- Official state government websites (an.gov.ng, ebonyistate.gov.ng)
- Linguistic research papers (ResearchGate, Journal of West African Languages)

### Confirmed Geographic Mapping

#### Anambra State (West of the Niger)
| Community | LGA(s) | Location in State |
|---|---|---|
| Ọnịcha (Onitsha) | Onitsha North, Onitsha South | Western edge, on River Niger |
| Obosi | Idemili South | Central, near Onitsha |
| Ogidi | Idemili North | Central |
| Ọka (Awka) | Awka South | Central |
| Achala | Awka North | North-central |
| Anam | Anambra West | Northwestern corner |
| Ajalị (Ajalli) | Orumba North | Southern |
| Anịọcha | Anambra East/Oyi | Central-eastern |

#### Imo State (South-central)
| Community | LGA(s) | Location in State |
|---|---|---|
| Owere (Owerri) | Owerri Municipal, North, West | Central, capital city |
| Mbaise | Aboh Mbaise, Ahiazu Mbaise, Ezinihitte Mbaise | Eastern |
| Isuama | Isu LGA | Western |
| Ihuoma | Isu LGA area | Western |
| Amaifeke | Orsu LGA | Northwestern |

#### Abia State (South-east)
| Community | LGA(s) | Location in State |
|---|---|---|
| Ngwa | 7 LGAs around Aba (Obingwa, Osisioma Ngwa, etc.) | Southern, largest Igbo subgroup in Abia |
| Abịrịba | Ohafia LGA | North-eastern |
| Mkpọọ | Arochukwu/Ohafia area | Eastern |
| Ọhụhụ (Ohuhu) | Umuahia North | Central |
| Ụmụahịa | Umuahia North, Umuahia South | Central, capital city |

#### Enugu State (Northern)
| Community | LGA(s) | Location in State |
|---|---|---|
| Nsụka | Nsukka LGA | Northern tip |
| Ezeagu | Ezeagu LGA | Southern |
| Nkanụ | Nkanu East, Nkanu West | South-eastern |

#### Ebonyi State (Eastern border)
| Community | LGA(s) | Location in State |
|---|---|---|
| Afiikpo | Afikpo North LGA | South-eastern |
| Ezaa | Ebonyi Central, North, South | Central |
| Ikwo | Ikwo LGA | Eastern |
| Ezzamgbo | Ohaukwu LGA | Northern |
| Izii | Izii LGA, east of Abakaliki | North-eastern |

### How They Cluster Geographically

```
         ENUGU STATE (Northern Igboland)
     ┌─────────────────────────────────────┐
     │  Nsụka (north)                      │
     │  Ezeagu (south)                     │
     │  Nkanụ (southeast)                  │
     └───────┬─────────────────────┬───────┘
  ANAMBRA    │                     │   EBONYI STATE
  STATE      │                     │  ┌──────────────┐
┌────────────┤                     │  │ Ezzamgbo (N) │
│ Anam (NW)  │                     │  │ Izii (NE)    │
│ Achala (N) │                     │  │ Ezaa (C)     │
│ Ọka (C)    │                     │  │ Ikwo (E)     │
│ Ogidi (C)  │                     │  │ Afiikpo (SE) │
│ Obosi (C)  │                     │  └──────────────┘
│ Ọnịcha (W) │                     │
│ Ajalị (S)  │                     │
└────────────┘                     │
             │   ABIA STATE        │
      IMO    │  ┌──────────────────┤
      STATE  │  │ Ụmụahịa (C)     │
  ┌──────────┤  │ Ọhụhụ (C)       │
  │Amaifeke  │  │ Abịrịba (NE)    │
  │Isuama    │  │ Mkpọọ (E)       │
  │Ihuoma    │  │ Ngwa (S, around  │
  │Owere (C) │  │       Aba)       │
  │Mbaise (E)│  └──────────────────┘
  └──────────┘
```

---

## 4. Map-Based Selection System Proposal

### Recommended Library: `react-simple-maps`

**Why**:
- Clean, modern SVG rendering — no ugly raster maps
- Uses D3's `d3-geo` under the hood — industry standard projections
- Accepts GeoJSON/TopoJSON directly — we load Nigeria states GeoJSON and filter to southeast
- Full React component model — `<ComposableMap>`, `<Geographies>`, `<Geography>`
- Supports hover, click, tooltips, custom styling per state
- Well-maintained, 3k+ GitHub stars
- ~30KB gzip — lightweight

### Data Source for Map
Free Nigeria states GeoJSON from `simplemaps.com` or `github.com/horlabyc/nigeria-states-GeoJSON`. Filter to 5 southeastern states + Delta/Rivers for border context.

### Implementation Plan

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  ┌────────────────────────────────────┐       │
│  │     [Select Your Dialect Region]   │       │
│  │                                    │       │
│  │    ┌─────────┐                     │       │
│  │    │ ENUGU   │ ← hover highlight   │       │
│  │ ┌──┤         ├──┐                  │       │
│  │ │AN│         │EB│                  │       │
│  │ │AM│         │ON│                  │       │
│  │ │BR│         │YI│                  │       │
│  │ │A │    ┌────┤  │                  │       │
│  │ └──┤IMO │ABIA│──┘                  │       │
│  │    │    │    │                      │       │
│  │    └────┴────┘                      │       │
│  │                                    │       │
│  │  Selected: Imo-area                │       │
│  │  Communities: Owere, Mbaise,       │       │
│  │               Isuama, Ihuoma       │       │
│  │  Coverage: 33 word variants        │       │
│  └────────────────────────────────────┘       │
│                                               │
│  [📚 Standard Igbo (default)]                 │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### How It Works

1. **SVG map** of 5 southeastern states (Anambra, Imo, Abia, Enugu, Ebonyi), rendered via `react-simple-maps` + Nigeria GeoJSON.
2. **Each state is clickable** — clicking selects that dialect region.
3. **Hover shows**: state name, community list, coverage count.
4. **Selected state highlighted** with color (current purple scheme).
5. **"Standard Igbo" button** below the map as the default/reset option.
6. **No other states shown** — only southeastern Igboland. Surrounding states can be shown greyed out for geographic context.

### Component Structure

```
src/components/ui/DialectMap.tsx
  ├── <ComposableMap>         (react-simple-maps)
  │   └── <Geographies>      (loads Nigeria GeoJSON, filters to SE states)
  │       └── <Geography>    (per-state, with onClick + hover styling)
  ├── <DialectInfo>           (shows selected state's communities + coverage)
  └── <StandardIgboButton>    (reset to default)
```

### Dependencies to Install
```bash
npm install react-simple-maps
```

GeoJSON file stored at `public/nigeria-states.json` (or fetched from CDN).

### State → Dialect Group Mapping (for the map)
```typescript
const STATE_TO_DIALECT: Record<string, DialectGroup> = {
  'Anambra': 'anambra',
  'Imo': 'imo',
  'Abia': 'abia',
  'Enugu': 'enugu',
  'Ebonyi': 'ebonyi'
};
```

This directly reuses our existing `DialectGroup` type from `src/lib/dialect.ts`.
