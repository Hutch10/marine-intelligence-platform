# Release Scope Policy

The file RELEASE_SCOPE.txt is an explicit authorization mechanism for pull requests merging into main.

**Important:** RELEASE_SCOPE.txt is per-PR authorization metadata, not a permanent description of main.

* It must exist in every PR.
* It must list the exact paths the PR is authorized to change.
* After a PR is merged, the file remains on main containing the *previous* PR's authorized scope. This is expected.
* The *next* PR must overwrite RELEASE_SCOPE.txt with its own specific paths, otherwise the required CI scope check will fail and block the merge.
