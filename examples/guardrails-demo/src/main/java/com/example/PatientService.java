package com.example;

/**
 * Healthcare Example - PHI (Protected Health Information) Detection
 *
 * This demonstrates HIPAA-compliant guardrails for medical applications.
 */
public class PatientService {

    /**
     * ❌ BAD: Hardcoded Medical Record Number
     * 🔴 CRITICAL: PHI violation - will be BLOCKED
     */
    public String getBadMRN() {
        return "MRN: 1234567";  // BLOCKED by Guardrails!
    }

    /**
     * ❌ BAD: Patient ID in code
     * 🔴 CRITICAL: PHI violation
     */
    private Long patientId = 12345L;  // Variable name triggers PHI detection

    /**
     * ❌ BAD: Date of birth
     * 🚫 BLOCK: PHI violation
     */
    private String dateOfBirth = "01/15/1980";

    /**
     * ⚠️  WARN: ICD-10 diagnosis code
     * Allowed with redaction (clinical reference)
     */
    private String diagnosisCode = "ICD-10:E11.9";  // Type 2 diabetes

    /**
     * ✅ GOOD: Use configuration/database
     */
    public String getGoodMRN() {
        // Fetch from secure database, not hardcoded
        return fetchFromDatabase();
    }

    /**
     * ✅ GOOD: Use parameter, not hardcoded value
     */
    public Patient getPatient(Long id) {
        // ID passed as parameter, not hardcoded
        return repository.findById(id);
    }

    /**
     * Expected Guardrails output:
     *
     * 🚫 Guardrails: Execution blocked (4 violations)
     *    🔴 3 critical violations (HIPAA PHI detected)
     *    - PHI: 4
     *
     * 📄 src/main/java/com/example/PatientService.java
     *   🔴 Line 15: Medical Record Number (phi)
     *   🔴 Line 22: Patient ID (phi)
     *   🚫 Line 28: Date of Birth (phi)
     *   ⚠️  Line 34: Diagnosis Code (phi)
     *
     * ❌ Cannot proceed. PHI must not be hardcoded.
     *
     * HIPAA Compliance: Protected Health Information (PHI) includes:
     * - Medical record numbers
     * - Patient identifiers
     * - Dates of birth
     * - Diagnosis codes (when linked to individuals)
     *
     * Fix: Use database lookups, not hardcoded values.
     */

    // Stub methods for compilation
    private String fetchFromDatabase() { return null; }
    private Repository repository = null;
    interface Repository { Patient findById(Long id); }
    static class Patient {}
}
