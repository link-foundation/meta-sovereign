"""Check small release metadata against complete native artifact inventories."""
import json
import re


def validate_desktop_metadata(directory, merge_commit):
    artifacts = json.loads((directory / 'summary.json').read_text())
    platforms = {item['name'].removeprefix('desktop-') for item in artifacts}
    assert len(artifacts) == len(platforms) == 5
    assert platforms == {'linux-x64', 'linux-arm64', 'windows-x64',
                         'windows-arm64', 'macos'}
    checksums = {}
    for artifact in artifacts:
        platform = artifact['name'].removeprefix('desktop-')
        assert 0 < artifact['fetchedBytes'] <= 524288
        names = [entry['name'] for entry in artifact['files']]
        assert len(names) == len(set(names))
        matches = [re.fullmatch(r'([a-f0-9]{64}) [ *](.+)', line)
                   for line in (directory / f'SHA256SUMS-{platform}.txt').read_text().splitlines()]
        assert matches and all(matches), platform
        filenames = [match[2] for match in matches]
        expected = {name for name in names if name.endswith(
            ('.dmg', '.zip', '.exe', '.deb', '.AppImage', '.tar.gz'))}
        assert len(filenames) == len(set(filenames)) and set(filenames) == expected
        provenance = (directory / f'provenance-{platform}.txt').read_text()
        assert f'commit: {merge_commit}' in provenance
        assert all(filename in provenance for filename in filenames)
        checksums[platform] = {match[2]: match[1] for match in matches}
    assert sum(map(len, checksums.values())) == 14
    assert 'macos-signing: adhoc' in (directory / 'provenance-macos.txt').read_text()
    return dict(artifacts=artifacts, checksums=checksums,
                metadataBytesFetched=sum(item['fetchedBytes'] for item in artifacts),
                independentlyHashedInstallerBytes=False)
