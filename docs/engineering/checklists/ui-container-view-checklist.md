# UI Container/View Checklist

- [ ] Container component owns data loading and mutation orchestration.
- [ ] Presentational view receives only props and callbacks.
- [ ] View layer has no direct imports from API client modules.
- [ ] Error/loading/empty/paywall states are rendered via reusable UI components.
- [ ] Page-level files are small and delegate to hooks/view components.
- [ ] Routes/pages do not contain direct `fetch('/.proxy/api/...')`.
- [ ] DTO-to-VM mapping is centralized in `src/client/viewmodels/*`.
