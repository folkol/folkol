import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime

import json

from jinja2 import Template

builds = sorted(int(d) for d in os.listdir('era-master/builds') if re.match(r'\d+', d))
recent_builds = builds[-60:]

tests = defaultdict(list)
for build in recent_builds:
    print('Processing build', build, file=sys.stderr)
    try:
        build_info = ET.parse(f'era-master/builds/{build}/build.xml').getroot()
        built_on = build_info.find('builtOn').text
        timestamp = build_info.find('timestamp').text
        date = datetime.fromtimestamp(int(timestamp) // 1000)

        test_results = ET.parse(f'era-master/builds/{build}/junitResult.xml')
        for case in test_results.getroot().findall(".//case"):
            test_class = case.find('className').text
            test_name = case.find('testName').text
            failedSince = case.find('failedSince').text
            tests[f'{test_class}:{test_name}'].append({
                'build': build,
                'success': failedSince == '0',
                'title': f'{build} @ {built_on} ({date})'
            })
    except FileNotFoundError:
        pass  # Display this somehow?

failed_tests = {
    test: {build['build']: build for build in builds}
    for test, builds in tests.items()
    if any(not build['success'] for build in builds)
}

with open('failed-tests.html.jinja2') as f:
    template = Template(f.read())

with open('failed-tests.html', 'w') as f:
    f.write(template.render(recent_builds=recent_builds, failed_tests=failed_tests))
