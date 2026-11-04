"""Offline schema checks; optional instance checks. Never install packages or fetch refs."""
import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--instance', nargs=2, action='append', default=[], metavar=('SCHEMA', 'JSON'))
    args = parser.parse_args()
    try:
        from jsonschema import Draft202012Validator, FormatChecker
        from referencing import Registry
        from referencing.jsonschema import DRAFT202012
        from referencing.exceptions import NoSuchResource
    except ImportError:
        print(json.dumps({'status': 'unavailable', 'reason': 'jsonschema dependency missing; use an existing Python environment'}))
        return 2
    root = args.root.resolve()
    paths = sorted((root / 'references').rglob('*.schema.json'))
    if not paths:
        raise ValueError('No reference schemas found')
    schemas = {p: json.loads(p.read_text(encoding='utf-8-sig')) for p in paths}
    resources = []
    for path, schema in schemas.items():
        Draft202012Validator.check_schema(schema)
        resource = DRAFT202012.create_resource(schema)
        resources.append((path.as_uri(), resource))
        if schema.get('$id'):
            resources.append((schema['$id'], resource))

    def offline(uri):
        raise NoSuchResource(ref=uri)

    registry = Registry(retrieve=offline).with_resources(resources)
    for schema_path, instance_path in args.instance:
        path = (root / schema_path).resolve()
        if path not in schemas:
            raise ValueError('Instance schema must be a checked reference schema')
        validator = Draft202012Validator(schemas[path], registry=registry, format_checker=FormatChecker())
        validator.validate(json.loads((root / instance_path).read_text(encoding='utf-8-sig')))
    print(json.dumps({'status': 'passed', 'schemas_valid': len(schemas), 'instances_valid': len(args.instance), 'network': 'disabled', 'scope': 'schema validity, not semantic quality'}))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'failed', 'reason': str(error)}, ensure_ascii=False))
        sys.exit(1)
