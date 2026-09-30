# Pinned intermediate CA certificates (public, not secret)

Some official hosts serve an incomplete TLS chain. Browsers/OS stores complete it via AIA; Python/OpenSSL on Linux
(GitHub Actions) does not. Instead of disabling verification, the missing PUBLIC intermediate is pinned here and used
only as an extra trust path (partial chain) in the TLS fallback of `tls_verified_get`.

| File | Host(s) | Issuer chain | Source | Valid until |
|---|---|---|---|---|
| `fnmt-ac-componentes-informaticos.pem` | `*.universidades.gob.es` | issued by AC RAIZ FNMT-RCM | AIA `http://www.cert.fnmt.es/certs/ACCOMP.crt` (SHA-256 F0:38:42:1F:07:F2:0D:63:A2:0D:36:91:E5:A1:78:AB:84:59:EB:E5:70:C1:64:7B:76:90:55:4E:F2:38:76:AB) | 2028-06-24 |

Verified with `openssl verify -partial_chain` against the live leaf certificate.

| `geotrust-tls-rsa-ca-g1.pem` | `resmigazete.gov.tr` | GeoTrust TLS RSA CA G1 (DigiCert) | AIA `http://cacerts.geotrust.com/GeoTrustTLSRSACAG1.crt` (SHA-256 C0:6E:30:7F:…:8A:23:0E) | 2027-11-02 |
| `sectigo-public-server-auth-ca-dv-r36.pem` | `ttb.org.tr` | Sectigo Public Server Authentication CA DV R36 | AIA `http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt` (SHA-256 8C:54:C3:34:…:EF:22:E0) | 2036-03-21 |

Each pin is loaded only for its listed host suffixes (`PINNED_INTERMEDIATE_HOSTS` in `radar/phase1_ingestion_canary.py`); other hosts never see it. Re-check expiry dates above before they lapse.

| `ssl-com-tls-issuing-rsa-ca-r1.pem` | `ttb.org.tr` | SSL.com TLS Issuing RSA CA R1 (root: SSL.com TLS RSA Root CA 2022) | AIA `http://cert.ssl.com/SSL.com-TLS-I-RSA-R1.cer` (SHA-256 BF:BC:39:E9:…:0C:69) | 2032-10-18 |

ttb.org.tr was reissued by SSL.com on 2026-09-28 and serves the leaf only; `openssl verify -CAfile <certifi> -untrusted <pin> <live leaf>` = OK (2026-09-30).
