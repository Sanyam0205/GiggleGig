"""LinkedIn / Indeed / Glassdoor / Google Jobs / ZipRecruiter via JobSpy (public guest listings, no login).

Usage: python jobspy_scrape.py '<json args>'  → one JSON object per line on stdout.
"""
import json
import math
import sys

from jobspy import scrape_jobs


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def main():
    args = json.loads(sys.argv[1])
    total = len(args["queries"]) * len(args["locations"])
    done = 0
    for query in args["queries"]:
        for location in args["locations"]:
            done += 1
            remote_only = bool(args.get("remoteOnly"))
            google_term = f"remote {query} jobs {location} since yesterday" if remote_only else f"{query} jobs near {location} since yesterday"
            try:
                df = scrape_jobs(
                    site_name=args["sites"],
                    search_term=query,
                    google_search_term=google_term,
                    location=location,
                    is_remote=remote_only or location.lower() == "remote",
                    country_indeed=args.get("country", "India"),
                    results_wanted=args["resultsPerQuery"],
                    hours_old=args["hoursOld"],
                    linkedin_fetch_description=True,
                    verbose=0,
                )
            except Exception as e:  # one site failing shouldn't sink the rest
                print(json.dumps({"error": f"{query} @ {location}: {e}"}), flush=True)
                continue
            print(json.dumps({"progress": f"{done}/{total} · {query} @ {location} → {len(df)} postings"}), flush=True)
            for row in df.to_dict(orient="records"):
                interval = clean(row.get("interval"))
                lo, hi = clean(row.get("min_amount")), clean(row.get("max_amount"))
                if interval == "hourly":
                    lo, hi = (lo and lo * 2080), (hi and hi * 2080)
                print(json.dumps({
                    "source": f"jobspy:{row.get('site')}",
                    "company": clean(row.get("company")) or "Unknown",
                    "title": clean(row.get("title")),
                    "location": clean(row.get("location")),
                    # LinkedIn honours the remote filter but rarely labels the row; other sites label it themselves.
                    "remote": bool(clean(row.get("is_remote"))) or (remote_only and row.get("site") == "linkedin"),
                    "url": clean(row.get("job_url")),
                    "applyUrl": clean(row.get("job_url_direct")) or clean(row.get("job_url")),
                    "description": clean(row.get("description")),
                    "salaryMin": lo,
                    "salaryMax": hi,
                    "currency": clean(row.get("currency")),
                    "postedAt": clean(row.get("date_posted")),
                }), flush=True)


if __name__ == "__main__":
    main()
