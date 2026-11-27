"""Independent audit of fixtures produced by test-construction-cad.cjs.

Usage: CAD_QA_DIR=/path/to/qa node scripts/test-construction-cad.cjs
       python scripts/audit-construction-cad.py /path/to/qa --render
Uses installed ezdxf, pypdf and PyMuPDF; never installs packages. Output stays
in the requested QA folder and contains only the synthetic fixture's data.
"""
import argparse
import json
from pathlib import Path

import ezdxf
import fitz
from pypdf import PdfReader


def audit(directory: Path, render: bool):
    manifest = json.loads((directory / "construction-manifest.json").read_text())
    report = {"ezdxf_version": ezdxf.__version__, "cases": []}
    for stem, expected_pages in [("construction-sample", len(manifest["sheets"])),
                                 ("construction-complex", manifest["complexSheets"])]:
        source = directory / (stem + ".dxf")
        drawing = ezdxf.readfile(source)
        check = drawing.audit()
        assert not check.errors and not check.fixes, "DXF requires repair: " + stem
        assert drawing.dxfversion == "AC1027" and drawing.units == 1
        modelspace = drawing.modelspace()
        dimensions = list(modelspace.query("DIMENSION"))
        assert dimensions, "No editable native dimensions"
        measures = [float(d.get_measurement()) for d in dimensions]
        for d, measured in zip(dimensions, measures):
            assert abs(measured - d.dxf.actual_measurement) < 1e-6
            assert d.dxf.geometry in drawing.blocks, "Missing dimension graphics block"
            assert "<>" in d.dxf.text, "Hard-coded dimension cannot update after a CAD edit"
        if stem == "construction-sample":
            for expected in [192, 144, 18, 12, 48, 4, 77, 11]:
                assert any(abs(value - expected) < 1e-6 for value in measures), f"Missing {expected}-in source dimension"
            facts = manifest["facts"][0]
            assert (facts["footingDiameterIn"], facts["footingDepthIn"]) == (18, 12)
            assert [(p["widthFt"], p["depthFt"], p["thicknessIn"], p["bags80lb"]) for p in facts["landings"]] == [(4, 4, 4, 12)]
        post_symbols = [e for e in modelspace.query("INSERT") if e.dxf.name.startswith("SNS_POST_")]
        assert post_symbols
        for symbol in post_symbols:
            assert abs(symbol.dxf.xscale - 1) < 1e-8 and abs(symbol.dxf.yscale - 1) < 1e-8
        roundtrip = directory / (stem + "-roundtrip.dxf")
        drawing.saveas(roundtrip)
        reopened = ezdxf.readfile(roundtrip)
        again = reopened.audit()
        assert not again.errors and not again.fixes
        restored = [float(d.get_measurement()) for d in reopened.modelspace().query("DIMENSION")]
        assert len(measures) == len(restored) and all(abs(a - b) < 1e-8 for a, b in zip(measures, restored))
        reader = PdfReader(directory / (stem + ".pdf"))
        assert len(reader.pages) == expected_pages
        assert all(list(page.mediabox) == [0, 0, 1224, 792] for page in reader.pages)
        assert sum(len(page.images) for page in reader.pages) == 0, "Raster image in construction PDF"
        assert sum(len(page.extract_text()) for page in reader.pages) > 1000
        pdf = fitz.open(directory / (stem + ".pdf"))
        overflow = []
        for page_number, page in enumerate(pdf, 1):
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        x0, y0, x1, y1 = span["bbox"]
                        if x0 < 23 or y0 < 23 or x1 > 1201 or y1 > 769:
                            overflow.append({"page": page_number, "bounds": list(span["bbox"])})
                        assert span["size"] >= 7.4, "Text smaller than reviewed print minimum"
            if render:
                page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False).save(directory / f"{stem}-{page_number:02}.png")
        assert not overflow, f"Text outside printable border: {overflow}"
        report["cases"].append({"fixture": stem, "pages": expected_pages, "native_dimensions": len(measures),
            "support_inserts": len(post_symbols), "dxf_errors": 0, "dxf_fixes": 0,
            "roundtrip": "passed", "units": "inches", "pdf_images": 0, "text_overflow": 0})
    (directory / "independent-cad-audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args()
    audit(args.directory, args.render)
