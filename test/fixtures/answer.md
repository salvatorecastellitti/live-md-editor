## Setting up **auth**

Install the package with `npm install auth-kit`, then read [the guide](https://example.com/guide).

1. Create an _API key_ in the dashboard.
2. Add it to `.env`:

   ```bash
   AUTH_KEY=sk_live_123
   ```

3. Restart the server.

- [x] Keys created
- [ ] Keys rotated

```ts
import { auth } from 'auth-kit'

const user = await auth()
console.log(user.name)
```

| Option    | Default | Notes          |
| --------- | ------- | -------------- |
| `ttl`     | 3600    | seconds        |
| `retries` | 3       | ~~5~~ since v2 |

> **Tip:** rotate keys every month.
>
> See the _security_ page.

That is all. Questions? Open an issue.
