"""Validate actual closed native/cross-origin automatic-prefill captures."""


def validate_automatic_capture(actual, expected_reviews=None):
    assert actual['submissions'] == 0 and actual['reads']
    if expected_reviews is not None:
        assert len(actual['reads']) == expected_reviews
    for read in actual['reads']:
        assert read['closed']
        main, child = read['automaticFrames']
        assert main['email'] == 'ada@example.test' and main['unknown'] == ''
        assert main['fullName'] == "Owner's current answer"
        assert main['location'] == 'vn' and main['newsletter'] is True
        assert main['start'] == '2027-01-15' and main['language'] == 'English'
        assert child['city'] == 'Vietnam, UTC+7'
        assert main['resume'][0]['size'] == child['childResume'][0]['size'] == 599
