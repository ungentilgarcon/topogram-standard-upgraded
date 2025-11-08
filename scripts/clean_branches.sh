#!/usr/bin/env bash
set -euo pipefail

# scripts/clean_branches.sh
# Safely clean local and remote branches that are behind the remote main branch.
# Defaults to a dry-run; use --run to perform deletions, or --yes to auto-confirm.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

REMOTE=origin
MAIN_BRANCH=main
DRY_RUN=true
AUTO_YES=false
DEBUG=false
DEBUG_ONLY=false

usage() {
  cat <<EOF
Usage: $0 [--run] [--yes] [--remote <name>] [--main <branch>] [--debug] [--debug-only]

Options:
  --run            Actually perform deletions. Without this the script does a dry-run.
  --yes            Auto-confirm deletions (only used with --run).
  --remote <name>  Remote name to operate on (default: origin).
  --main <name>    Main branch name to compare against (default: main).
  --debug          Print internal ref parsing diagnostics (raw/tail/s/push_branch).
  --debug-only     Show diagnostics then exit before classification/deletion logic.
  -h, --help       Show this help.

Behavior:
  - Fetches from the remote and prunes stale refs.
  - Detects local and remote branches where the branch has no unique commits
    (i.e. all commits are also in remote/main) and marks them as safe to delete.
  - For branches that have unique commits or have diverged, prompts for confirmation
    before deleting.
  - Never touches the configured main branch.

Run without --run to preview actions (recommended).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) DRY_RUN=false; shift ;;
    --yes) AUTO_YES=true; shift ;;
    --debug) DEBUG=true; shift ;;
    --debug-only) DEBUG=true; DEBUG_ONLY=true; shift ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --main) MAIN_BRANCH="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

echo "Fetching from remote '$REMOTE' (prune stale refs)..."
git fetch --prune "$REMOTE"

if ! git show-ref --verify --quiet "refs/remotes/$REMOTE/$MAIN_BRANCH"; then
  echo "Warning: remote main branch refs/remotes/$REMOTE/$MAIN_BRANCH not found. Falling back to local $MAIN_BRANCH if present."
  if git show-ref --verify --quiet "refs/heads/$MAIN_BRANCH"; then
    COMPARE_REF="refs/heads/$MAIN_BRANCH"
  else
    echo "Could not find a main branch to compare against. Aborting." >&2
    exit 3
  fi
else
  COMPARE_REF="refs/remotes/$REMOTE/$MAIN_BRANCH"
fi

echo "Using compare ref: $COMPARE_REF"

mapfile -t LOCAL_BRANCHES < <(git for-each-ref --format='%(refname:short)' refs/heads)
mapfile -t REMOTE_BRANCHES < <(git for-each-ref --format='%(refname:short)' refs/remotes/$REMOTE | sed -e "s|^${REMOTE}/||")

# Helpers to collect candidates
declare -a LOCAL_SAFE=()
declare -a LOCAL_ASK=()
declare -a REMOTE_SAFE=()
declare -a REMOTE_ASK=()

check_branch_pairs() {
  local branch_ref="$1"  # full ref to compare (e.g. refs/heads/foo or refs/remotes/origin/foo)
  local short_name="$2"
  # Use rev-list to get counts: left = commits only in branch_ref, right = commits only in compare_ref
  local counts
  if ! counts=$(git rev-list --left-right --count "$branch_ref"..."$COMPARE_REF" 2>/dev/null); then
    echo "Skipping $short_name: could not compare refs ($branch_ref vs $COMPARE_REF)" >&2
    return
  fi
  local left right
  left=$(awk '{print $1}' <<<"$counts")
  right=$(awk '{print $2}' <<<"$counts")

  if [[ "$left" -eq 0 && "$right" -gt 0 ]]; then
    # branch has no unique commits, main has commits -> safe to delete
    echo "SAFE: $short_name (behind main, no unique commits)"
    return 0
  fi
  if [[ "$left" -eq 0 && "$right" -eq 0 ]]; then
    # identical to compare ref
    echo "IDENTICAL: $short_name (identical to main)"
    return 0
  fi
  # Otherwise branch has unique commits or diverged
  echo "AMBIG: $short_name (left=$left right=$right)"
  return 1
}

# Process local branches
for b in "${LOCAL_BRANCHES[@]}"; do
  # skip main
  if [[ "$b" == "$MAIN_BRANCH" ]]; then continue; fi
  full_ref="refs/heads/$b"
  if git show-ref --verify --quiet "$COMPARE_REF"; then
    if check_branch_pairs "$full_ref" "$b"; then
      LOCAL_SAFE+=("$b")
    else
      LOCAL_ASK+=("$b")
    fi
  fi
done

if [[ "$DEBUG_ONLY" == true ]]; then
  echo "Debug-only mode: exiting after diagnostics."; exit 0
fi
 
# Process remote branches
for rb in "${REMOTE_BRANCHES[@]}"; do
  # strip potential remote/ prefix
  short_rb="$rb"
  # skip HEAD and main
  if [[ "$short_rb" == "HEAD" || "$short_rb" == "$MAIN_BRANCH" ]]; then continue; fi
  full_ref="refs/remotes/$REMOTE/$short_rb"
  if check_branch_pairs "$full_ref" "$REMOTE/$short_rb"; then
    REMOTE_SAFE+=("$short_rb")
  else
    REMOTE_ASK+=("$short_rb")
  fi
done

echo
echo "Summary (dry-run=$DRY_RUN):"
echo "  Local safe to delete: ${#LOCAL_SAFE[@]}"
for x in "${LOCAL_SAFE[@]}"; do echo "    $x"; done
echo "  Local ambiguous: ${#LOCAL_ASK[@]}"
for x in "${LOCAL_ASK[@]}"; do echo "    $x"; done
echo "  Remote safe to delete: ${#REMOTE_SAFE[@]}"
for x in "${REMOTE_SAFE[@]}"; do echo "    $x"; done
echo "  Remote ambiguous: ${#REMOTE_ASK[@]}"
for x in "${REMOTE_ASK[@]}"; do echo "    $x"; done

confirm() {
  local prompt="$1"
  if [[ "$AUTO_YES" == true ]]; then
    return 0
  fi
  read -r -p "$prompt [y/N]: " ans
  case "$ans" in
    [yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

perform_deletions() {
  # local safe
  for b in "${LOCAL_SAFE[@]}"; do
    if [[ "$DRY_RUN" == true ]]; then
      echo "DRY-RUN: would delete local branch '$b' (git branch -d $b)"
    else
      echo "Deleting local branch: $b"
      git branch -d "$b" || git branch -D "$b"
    fi
  done

  # remote safe
  for rb in "${REMOTE_SAFE[@]}"; do
    if [[ "$DRY_RUN" == true ]]; then
      echo "DRY-RUN: would delete remote branch '$rb' on $REMOTE (git push $REMOTE --delete $rb)"
    else
      echo "Deleting remote branch: $rb"
      git push "$REMOTE" --delete "$rb" || echo "Failed to delete remote $rb" >&2
    fi
  done

  # ambiguous local: ask per-branch
  for b in "${LOCAL_ASK[@]}"; do
    if confirm "Delete ambiguous local branch '$b'? (may contain commits not in main)"; then
      if [[ "$DRY_RUN" == true ]]; then
        echo "DRY-RUN: would delete local branch '$b'"
      else
        git branch -D "$b"
      fi
    else
      echo "Skipping local branch '$b'"
    fi
  done

  # ambiguous remote: ask per-branch
  for rb in "${REMOTE_ASK[@]}"; do
    if confirm "Delete ambiguous remote branch '$rb' on $REMOTE? (may contain commits not in main)"; then
      if [[ "$DRY_RUN" == true ]]; then
        echo "DRY-RUN: would delete remote branch '$rb'"
      else
        git push "$REMOTE" --delete "$rb" || echo "Failed to delete remote $rb" >&2
      fi
    else
      echo "Skipping remote branch '$rb'"
    fi
  done
}

if [[ "$DRY_RUN" == true ]]; then
  echo
  echo "Dry-run complete. To perform deletions run: $0 --run [--yes]"
  exit 0
fi

echo
echo "About to perform deletions. This will act on the branches listed above."
if ! confirm "Proceed with deletions now?"; then
  echo "Aborted by user. No changes made."
  exit 0
fi

perform_deletions

echo "Done."
