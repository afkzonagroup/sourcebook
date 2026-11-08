# Legal basis

Sourcebook helps a provider draw up one document: the public summary of the
content used to train a general-purpose AI model. This page quotes the
official texts it relies on. It is not legal advice.

All quotations are from the official texts on EUR-Lex and the Commission's
website, read on 8 November 2026:

- Regulation (EU) 2024/1689 (AI Act), OJ L, 2024/1689, 12.7.2024:
  <https://eur-lex.europa.eu/eli/reg/2024/1689/oj>
- Regulation (EU) 2026/1744 (Digital Omnibus on AI), OJ L, 2026/1744,
  24.7.2026: <https://eur-lex.europa.eu/eli/reg/2026/1744/oj>
- Consolidated text of Regulation (EU) 2024/1689 as of 27.7.2026
  (02024R1689-20260727), which includes the amendments of Regulation (EU)
  2026/1744: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02024R1689-20260727>
  (the consolidated text is a documentation tool; only the Official Journal
  is authentic).
- Communication from the Commission C(2025) 8311 final of 5 December 2025,
  "Explanatory Notice and Template for the Public Summary of Training Content
  for general-purpose AI models required by Article 53 (1)(d) of Regulation
  (EU) 2024/1689 (AI Act)", and the Word version of the Template, published at
  <https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models>
  (first published on 24 July 2025; page last updated 26 March 2026).

## Who is covered

Article 3(63) AI Act defines a "general-purpose AI model" as "an AI model,
including where such an AI model is trained with a large amount of data using
self-supervision at scale, that displays significant generality and is
capable of competently performing a wide range of distinct tasks regardless
of the way the model is placed on the market and that can be integrated into
a variety of downstream systems or applications, except AI models that are
used for research, development or prototyping activities before they are
placed on the market".

Article 3(64) to (66) define "high-impact capabilities", "systemic risk" and
"general-purpose AI system". Regulation (EU) 2026/1744 did not change points
(63) to (66); it inserted points (14a) "SME" (by reference to
Recommendation 2003/361/EC) and (14b) "SMC" (small mid-cap enterprise).

## The obligation: Article 53(1)(d)

"Providers of general-purpose AI models shall: [...] (d) draw up and make
publicly available a sufficiently detailed summary about the content used for
training of the general-purpose AI model, according to a template provided by
the AI Office."

## Open-source models: Article 53(2)

"The obligations set out in paragraph 1, points (a) and (b), shall not apply
to providers of AI models that are released under a free and open-source
licence that allows for the access, usage, modification, and distribution of
the model, and whose parameters, including the weights, the information on
the model architecture, and the information on model usage, are made publicly
available. This exception shall not apply to general-purpose AI models with
systemic risks."

The exception covers points (a) (technical documentation) and (b)
(information for downstream providers) only. It does not cover point (c)
(copyright policy) or point (d) (this summary). The Explanatory Notice says
the same in its footnote 4: "The exception for free and open-source
general-purpose AI model under Article 53(2) AI Act does not apply to the
obligation to make publicly available the Summary."

## Authorised representative: Article 54

Article 54(1): "Prior to placing a general-purpose AI model on the Union
market, providers established in third countries shall, by written mandate,
appoint an authorised representative which is established in the Union."

Article 54(6): "The obligation set out in this Article shall not apply to
providers of general-purpose AI models that are released under a free and
open-source licence that allows for the access, usage, modification, and
distribution of the model, and whose parameters, including the weights, the
information on the model architecture, and the information on model usage,
are made publicly available, unless the general-purpose AI models present
systemic risks."

The template's field "Authorised representative name and contact details" is
"Only applicable if the provider is established outside the Union (see
Article 54 AI Act)". Sourcebook therefore asks whether it applies and, if
not, why: `established_in_union` or `open_source_exemption` (Article 54(6)).

## Dates

| Date | What | Source |
|---|---|---|
| 2 August 2025 | Chapter V (including Article 53) applies | Article 113, third paragraph, point (b): "Chapter III Section 4, Chapter V, Chapter VII and Chapter XII and Article 78 shall apply from 2 August 2025, with the exception of Article 101" |
| 2 August 2026 | Article 101 (fines for providers of general-purpose AI models) applies, with the general date of application | Article 113, second paragraph ("It shall apply from 2 August 2026") and point (b) above; Explanatory Notice, point 33: "The supervision and enforcement by the AI Office for compliance with the rules for general-purpose AI models will start as of 2 August 2026." |
| 2 August 2027 | Models placed on the market before 2 August 2025 | Article 111(3): "Providers of general-purpose AI models that have been placed on the market before 2 August 2025 shall take the necessary steps in order to comply with the obligations laid down in this Regulation by 2 August 2027." Explanatory Notice, point 33, adds that such providers who cannot provide some information "should clearly state and justify the corresponding information gaps in its Summary". |

Regulation (EU) 2026/1744 amended Article 111 (it replaced paragraph 2 and
added paragraph 4, both about AI systems) and Article 113 (points (a) and
(c) of the third paragraph replaced, point (d) added). It did not change
Article 111(3) or Article 113, third paragraph, point (b). It did not amend
Articles 53, 54 or 101. (Article 97 now lists the delegations under
Article 53(5) and (6) with new ones; Article 99, which concerns penalties set
by Member States, got a new paragraph 6a on SMCs; neither changes the
summary.)

## Fines: Article 101

Article 101(1): "The Commission may impose on providers of general-purpose AI
models fines not exceeding 3 % of their annual total worldwide turnover in
the preceding financial year or EUR 15 000 000, whichever is higher., when
the Commission finds that the provider intentionally or negligently: (a)
infringed the relevant provisions of this Regulation; [...]" (punctuation as in the Official Journal).

## The template

The template is the Annex to Communication C(2025) 8311 final. Its use is
mandatory: Article 53(1)(d) requires the summary "according to a template
provided by the AI Office", and the Commission's FAQ states "Under Article
53(1)(d) of the AI Act, using the Template is mandatory."

Points of the Explanatory Notice that Sourcebook implements:

| Point | What it says | How Sourcebook uses it |
|---|---|---|
| 13 | The Summary covers "data used in all stages of the model training, from pre-training to post-training, including model alignment and fine-tuning". | Every section of the template is in the schema. |
| 16, footnote 16 | Top 10 % of domain names by size of content scraped; SMEs top 5 % or 1 000, whichever is lower. | `collect crawl`, see [domain-ranking.md](domain-ranking.md). |
| 24 (footnote 24) | Each section has "a box for possible additional information (optional)". | Information gaps are printed in the box of the field's section. |
| 28, 30, 31 | Modified models report only the modification data and name the original model; one Summary may cover several models or versions. | Section 1.2 fields; several model names and placement dates. |
| 29 | Update "at six-month intervals or if in the meantime the additional data [...] requires a materially significant update [...], whichever is sooner". | A warning when the model is continuously trained and the last update is more than six months old. |
| 32 | Publish "at the latest when the model is placed on the Union market", on the provider's website and "together with the model across all its public distribution channels". | HTML for the website; the model card section for the Hugging Face Hub. |
| 33 | Dates, and information gaps for models placed on the market before 2 August 2025. | Gap statements accepted only for such models. |

## Small and medium-sized enterprises

The template's SME rule ("Small and medium-sized enterprises (SMEs),
including start-ups, should disclose top 5% of all domain names or 1 000
internet domain names, whichever is lower") refers to SMEs only. Since
Regulation (EU) 2026/1744, Article 3(14a) defines an SME by reference to
Recommendation 2003/361/EC. Small mid-cap enterprises (Article 3(14b)) are
not mentioned in the template; Sourcebook applies the SME rule only when you
pass `--sme`, and you decide whether you qualify.
