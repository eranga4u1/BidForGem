/** Conventional Commits enforcement. See https://www.conventionalcommits.org */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      [
        "api",
        "web",
        "mobile",
        "types",
        "api-client",
        "config",
        "repo",
        "ci",
        "deps",
        // domain scopes (build order)
        "db",
        "auth",
        "bidding",
        "auctions",
        "media",
        "notifications",
      ],
    ],
  },
};
