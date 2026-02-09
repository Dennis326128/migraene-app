# API Contract: get-shared-report-data

**Version:** v1  
**Effective:** 2026-02-09  
**Status:** ACTIVE

## Endpoint

`GET /functions/v1/get-shared-report-data`

## Authentication

- Cookie: `doctor_session=<session_id>`
- Header: `x-doctor-session: <session_id>`

## Query Parameters

| Param    | Type   | Default | Description                          |
|----------|--------|---------|--------------------------------------|
| `range`  | string | `3m`    | `30d`, `3m`, `6m`, `12m`             |
| `page`   | number | `1`     | Pagination for entries table         |
| `legacy` | `1`    | —       | Opt-in: include deprecated flat fields |

## Headers (optional)

| Header             | Value | Description                        |
|--------------------|-------|------------------------------------|
| `X-Report-Legacy`  | `1`   | Alternative legacy opt-in via header |

## Response (v1 — default)

```json
{
  "report": {
    "meta": {
      "range": "3m",
      "fromDate": "2025-11-09",
      "toDate": "2026-02-09",
      "generatedAt": "2026-02-09T14:30:00.000Z",
      "timezone": "Europe/Berlin",
      "reportVersion": "v1",
      "schemaVersion": "v1",
      "period": {
        "fromDate": "2025-11-09",
        "toDate": "2026-02-09",
        "daysInRange": 93,
        "documentedDaysCount": 45,
        "entriesCount": 52
      },
      "normalization": {
        "enabled": true,
        "targetDays": 30,
        "basisDays": 93
      }
    },
    "summary": {
      "daysInRange": 93,
      "headacheDays": 22,
      "migraineDays": 8,
      "triptanDays": 5,
      "acuteMedDays": 15,
      "auraDays": 3,
      "avgIntensity": 5.4,
      "overuseWarning": false,
      "documentationGaps": { "gapDays": 48, "message": "..." },
      "kpis": { "painDays": 22, "migraineDays": 8, "..." : "..." },
      "normalizedKPIs": { "painDaysPer30": 7.1, "migraineDaysPer30": 2.6, "..." : "..." },
      "totalTriptanIntakes": 7
    },
    "charts": {
      "intensityOverTime": [
        { "date": "2025-11-10", "maxIntensity": 7, "isMigraine": true }
      ],
      "topAcuteMeds": [
        { "label": "Ibuprofen 400", "value": 12, "category": "akut" }
      ]
    },
    "tables": {
      "entries": [
        {
          "id": 123,
          "date": "2026-02-08",
          "time": "14:30",
          "createdAt": "2026-02-08T14:30:00Z",
          "intensity": 7,
          "intensityLabel": "Stark",
          "medications": ["Sumatriptan 50mg"],
          "note": null,
          "aura": null,
          "painLocations": ["links", "schläfe"]
        }
      ],
      "entriesTotal": 52,
      "entriesPage": 1,
      "entriesPageSize": 100,
      "prophylaxisCourses": [],
      "medicationStats": [],
      "locationStats": { "links": 15, "schläfe": 12 }
    },
    "optional": {
      "patientData": {
        "firstName": "Max",
        "lastName": "Mustermann",
        "fullName": "Max Mustermann",
        "dateOfBirth": "1990-01-15",
        "healthInsurance": "AOK",
        "insuranceNumber": "A123456789"
      }
    }
  }
}
```

## Legacy Mode (deprecated, opt-in only)

When `?legacy=1` or `X-Report-Legacy: 1` is set, the response **additionally** contains flat snake_case fields at the root level (`patient`, `summary`, `chart_data`, `entries`, etc.) for backward compatibility.

**Legacy will be removed** once all consumers have migrated to `response.report`.

## Migration Timeline

| Date       | Action                                    |
|------------|-------------------------------------------|
| 2026-02-09 | v1 is default, legacy is opt-in           |
| 2026-02-23 | Legacy opt-in removal (target)            |

## Error Responses

```json
{ "error": "string", "reason": "no_session|session_not_found|session_ended|share_revoked|share_expired|not_shared|session_timeout" }
```

Status codes: `401` (auth errors), `500` (internal errors)
