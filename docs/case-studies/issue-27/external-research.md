# External Research

The issue asked for online research and named Apple, Google, and Microsoft
design guidance in the related issue 25 context. The chosen fix keeps the
existing local component system but follows the same product-shape principles:
stable top-level navigation, responsive navigation surfaces, and clear empty
states that route users to the right task surface.

## Sources Checked

- Apple Human Interface Guidelines, Tab bars:
  https://developer.apple.com/design/human-interface-guidelines/tab-bars
- Android Developers, Build responsive navigation:
  https://developer.android.com/develop/ui/views/layout/build-responsive-navigation
- W3C WAI, WCAG 2.2 Understanding Success Criterion 2.5.8 Target Size
  (Minimum):
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C WAI, WCAG 2.2 Understanding Success Criterion 3.2.3 Consistent
  Navigation:
  https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html
- Fluent 2 Design System, React Nav usage:
  https://fluent2.microsoft.design/components/web/react/core/nav/usage

## Findings Applied

Apple's tab guidance supports keeping top-level navigation stable and using
empty states to explain unavailable content instead of hiding navigation. That
maps to keeping every data section available while sending setup work to
Connections.

Android's responsive-navigation guidance supports using different navigation
surfaces by window size while keeping one coherent navigation graph. That maps
to preserving the existing AppShell and adding provider-detail hash routing
inside the existing Connections destination instead of introducing a second
provider setup destination under Settings.

WCAG target-size guidance reinforces using real buttons for the empty-state
CTA, not small inline text links that would be hard to activate on touch
screens. WCAG consistent-navigation guidance reinforces keeping Connections as
a predictable destination instead of repeating operational setup controls in
many unrelated data views.

Fluent Nav guidance frames navigation as a high-level wayfinding component,
not a place to embed unrelated edit actions. That supports moving provider
edit/import/probe actions into the provider detail content rather than mixing
them into global navigation or every empty state.

## Component/Library Review

- Chakra UI: useful for a larger design-system migration, but unnecessary for
  this issue because the app already has local React primitives, stable tests,
  and a lightweight bundle. Introducing Chakra only for moving controls would
  add dependency and migration risk.
- React Router: could make provider detail URLs more formal, but the app
  already uses an internal view switcher plus hash anchors. The issue only
  requires data-page -> Connections -> provider detail routing, which the
  current mechanism supports.
- Existing local components: `providerCatalogue`, `providerSetupSteps`,
  `ConnectionDetail`, and `ConnectionGuide` already contain the needed domain
  model. Reusing them minimizes behavioral drift and preserves translations.
