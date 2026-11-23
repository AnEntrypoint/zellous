F=docs/PENDING_VALIDATION.md
ZERO=0000000000000000000000000000000000000000
fail=0
while read local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$ZERO" ] && continue
  new=$(git show "$local_sha:$F" 2>/dev/null)
  if [ "$remote_sha" != "$ZERO" ]; then
    oldn=$(git show "$remote_sha:$F" 2>/dev/null | wc -l)
    newn=$(printf '%s\n' "$new" | wc -l)
    if [ "$newn" -lt "$oldn" ]; then
      echo "pre-push: $F shrinks from $oldn to $newn lines; refusing" >&2
      fail=1
    fi
    range="$remote_sha..$local_sha"
  else
    range="$local_sha"
  fi
  cited=$(git log --format=%B "$range" 2>/dev/null | grep -io 'ledger[^.]*' | grep -o '[0-9]\+' | sort -un)
  for n in $cited; do
    printf '%s\n' "$new" | grep -q "^$n\. " || { echo "pre-push: a commit cites ledger entry $n but $F has no entry $n; refusing" >&2; fail=1; }
  done
done
exit $fail
