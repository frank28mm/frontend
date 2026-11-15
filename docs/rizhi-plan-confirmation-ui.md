# Revision Plan Confirmation UI

Plan actions use canonical assistant blocks, independent of report pricing. A read refresh precedes an explicit button execution. The UI fences account/token, conversation/source turn, plan/job identity and result version. No automatic execution or natural-language confirmation is introduced.

Generated results navigate to `/plan/{id}?profileId={confirmed-child}&version={job-version}`. Generation-disabled, expired, invalidated, uncertain and failed states are explicit. Existing report confirmations remain covered by regression tests.

Main-thread verification: 53 Vitest files / 811 tests passed after fixing backend business-detail precedence over Axios transport codes; production build and changed-file ESLint passed. Real AxiosError regressions cover definitive 503/409 rejection, malformed detail and identity isolation. Ego Lite controlled fixtures verified button execution and matched result navigation at 320px and desktop; a disabled-generation AxiosError leaves message input and new-conversation controls unlocked. This is rendered UI evidence, not real Ark/backend acceptance. Production flags and coupons are unchanged.
