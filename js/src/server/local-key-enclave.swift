// Wrap the local TLS private key with a device-only Secure Enclave key.
// Only encrypted key representations leave the enclave. Node decrypts its
// TLS key into memory at startup; TLS signing itself is not enclave-backed.
import CryptoKit
import Foundation
import Security

struct Envelope: Codable {
    let version: Int
    let protection: String
    let deviceKey: Data
    let ephemeralPublicKey: Data
    let ciphertext: Data
}

struct Request: Decodable {
    let key: String?
    let context: String?
    let envelope: Envelope?
}

func output<T: Encodable>(_ value: T) throws {
    FileHandle.standardOutput.write(try JSONEncoder().encode(value))
}

func derivedKey(_ shared: SharedSecret, _ context: String) -> SymmetricKey {
    shared.hkdfDerivedSymmetricKey(
        using: SHA256.self,
        salt: Data("meta-sovereign/local-tls/v1".utf8),
        sharedInfo: Data(context.utf8),
        outputByteCount: 32
    )
}

do {
    guard SecureEnclave.isAvailable else {
        throw NSError(domain: "meta-sovereign", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Secure Enclave is unavailable on this Mac"
        ])
    }
    let mode = CommandLine.arguments.dropFirst().first ?? ""
    if mode == "check" {
        try output(["available": true])
    } else {
        let request = try JSONDecoder().decode(
            Request.self, from: FileHandle.standardInput.readDataToEndOfFile()
        )
        guard let context = request.context, !context.isEmpty else {
            throw NSError(domain: "meta-sovereign", code: 2)
        }
        if mode == "seal", let key = request.key {
            var error: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(
                nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .privateKeyUsage, &error
            ) else {
                throw error!.takeRetainedValue() as Error
            }
            let device = try SecureEnclave.P256.KeyAgreement.PrivateKey(
                accessControl: access
            )
            let ephemeral = P256.KeyAgreement.PrivateKey()
            let shared = try ephemeral.sharedSecretFromKeyAgreement(with: device.publicKey)
            let sealed = try AES.GCM.seal(
                Data(key.utf8), using: derivedKey(shared, context),
                authenticating: Data(context.utf8)
            )
            try output(Envelope(
                version: 1, protection: "secure-enclave",
                deviceKey: device.dataRepresentation,
                ephemeralPublicKey: ephemeral.publicKey.rawRepresentation,
                ciphertext: sealed.combined!
            ))
        } else if mode == "open", let envelope = request.envelope,
                  envelope.version == 1, envelope.protection == "secure-enclave" {
            let device = try SecureEnclave.P256.KeyAgreement.PrivateKey(
                dataRepresentation: envelope.deviceKey
            )
            let ephemeral = try P256.KeyAgreement.PublicKey(
                rawRepresentation: envelope.ephemeralPublicKey
            )
            let shared = try device.sharedSecretFromKeyAgreement(with: ephemeral)
            let key = try AES.GCM.open(
                AES.GCM.SealedBox(combined: envelope.ciphertext),
                using: derivedKey(shared, context), authenticating: Data(context.utf8)
            )
            guard let text = String(data: key, encoding: .utf8) else {
                throw NSError(domain: "meta-sovereign", code: 3)
            }
            try output(["key": text])
        } else {
            throw NSError(domain: "meta-sovereign", code: 4)
        }
    }
} catch {
    // No key material, request, or envelope is ever printed on failure.
    FileHandle.standardError.write(Data("Local TLS device key: \(error.localizedDescription)\n".utf8))
    exit(1)
}
