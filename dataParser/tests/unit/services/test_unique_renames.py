import pandas as pd

from services.nd_builder_service import unique_renames


def test_unique_renames_maps_display_names_to_word_keys():
    # English Words rows for uniques (Wordlist 6) after GGG renamed some:
    # Text keeps the old key, Text2 is the name the trade site shows.
    words = pd.DataFrame(
        [
            {"Wordlist": 6, "Text": "Sekhema's Resolve Cold", "Text2": "Eshtera's Path"},
            {"Wordlist": 6, "Text": "Brynabas", "Text2": "Byrnabas"},
            {"Wordlist": 6, "Text": "Husk of Dreams", "Text2": "Reverie"},
            {"Wordlist": 6, "Text": "Svalinn", "Text2": "Svalinn"},
            {"Wordlist": 1, "Text": "Dire", "Text2": "Grim"},
        ]
    )

    assert unique_renames(words) == {
        "Eshtera's Path": "Sekhema's Resolve Cold",
        "Byrnabas": "Brynabas",
        "Reverie": "Husk of Dreams",
    }


def test_unique_renames_leaves_a_name_that_is_also_a_key():
    words = pd.DataFrame(
        [
            {"Wordlist": 6, "Text": "Old Name", "Text2": "Taken"},
            {"Wordlist": 6, "Text": "Taken", "Text2": "Taken"},
        ]
    )

    assert unique_renames(words) == {}
