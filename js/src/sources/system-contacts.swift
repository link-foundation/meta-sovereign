// Read the public Contacts framework after the person's OS permission.
// No AddressBook database, credentials, notes or photos are accessed.
import Contacts
import Foundation

func emit(_ object: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: object) {
        FileHandle.standardOutput.write(data)
    }
}

func authorization() -> String {
    let status = CNContactStore.authorizationStatus(for: .contacts)
    switch status {
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized: return "authorized"
    @unknown default: return status.rawValue == 4 ? "limited" : "unknown"
    }
}

@main struct SystemContacts {
    static func main() async {
        let mode = CommandLine.arguments.dropFirst().first ?? "status"
        if mode == "status" {
            emit(["ok": true, "authorization": authorization()])
            return
        }
        do {
            let store = CNContactStore()
            if authorization() == "not-determined" {
                _ = try await store.requestAccess(for: .contacts)
            }
            guard ["authorized", "limited"].contains(authorization()) else {
                emit(["ok": false, "code": "contacts-permission-denied"])
                return
            }
            let keys = [
                CNContactIdentifierKey, CNContactGivenNameKey,
                CNContactMiddleNameKey, CNContactFamilyNameKey,
                CNContactNicknameKey, CNContactOrganizationNameKey,
                CNContactJobTitleKey, CNContactPhoneNumbersKey,
                CNContactEmailAddressesKey, CNContactUrlAddressesKey,
                CNContactPostalAddressesKey
            ].map { $0 as CNKeyDescriptor }
            let request = CNContactFetchRequest(keysToFetch: keys)
            request.unifyResults = true
            var contacts: [[String: Any]] = []
            try store.enumerateContacts(with: request) { contact, _ in
                let name = [contact.givenName, contact.middleName, contact.familyName]
                    .filter { !$0.isEmpty }.joined(separator: " ")
                contacts.append([
                    "uid": contact.identifier,
                    "name": name.isEmpty ? contact.organizationName : name,
                    "nickname": contact.nickname,
                    "organization": contact.organizationName,
                    "title": contact.jobTitle,
                    "phones": contact.phoneNumbers.map { $0.value.stringValue },
                    "emails": contact.emailAddresses.map { $0.value as String },
                    "urls": contact.urlAddresses.map { $0.value as String },
                    "addresses": contact.postalAddresses.map {
                        ["street": $0.value.street, "city": $0.value.city,
                         "region": $0.value.state, "postalCode": $0.value.postalCode,
                         "country": $0.value.country]
                    }
                ])
            }
            emit(["ok": true, "authorization": authorization(), "contacts": contacts])
        } catch {
            emit(["ok": false, "code": "contacts-read-failed"])
        }
    }
}
