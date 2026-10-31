"""Curated City Guide baseline.

Coordinates were checked against Nominatim on 2026-10-31.  Editorial priority is
an internal recommendation (1 is highest); it is not a popularity or visitor
count metric. Visit durations are estimates, not official timings.
"""

from copy import deepcopy

OSM = "https://www.openstreetmap.org"
MUMBAI_SOURCE = "https://mumbaicity.gov.in/en/tourism/tourist-places/"
BENGALURU_SOURCE = "https://bengaluruurban.nic.in/en/tourism/"


def _place(city, slug, name, latitude, longitude, category, description, minutes, priority, explanation, source, *, access=None):
    metadata = {
        "description": description,
        "editorial_priority": str(priority),
        "priority_explanation": explanation,
        "source_url": source,
        "data_checked": "Nominatim 2026-10-31",
    }
    if access:
        metadata["access_notes"] = access
    return {
        "id": f"catalog-{city}-{slug}",
        "name": name,
        "coordinates": {"latitude": latitude, "longitude": longitude},
        "metadata": metadata,
        "category": category,
        "visit_minutes": minutes,
        "duration_basis": "Curated estimate; not an official visit duration",
        "source": source,
        "source_url": source,
        "attribution": "OpenStreetMap coordinates, checked with Nominatim; editorial descriptions from the cited tourism source",
        "editorial_priority": priority,
        "priority_explanation": explanation,
    }


CATALOG = {
    "mumbai": [
        _place("mumbai", "gateway-of-india", "Gateway of India", 18.9219661, 72.8345657, "heritage", "An Indo-Saracenic arch monument on the Apollo Bunder waterfront overlooking the Arabian Sea.", 45, 1, "Core South Mumbai landmark with a clearly documented public setting.", MUMBAI_SOURCE),
        _place("mumbai", "csmt", "Chhatrapati Shivaji Maharaj Terminus", 18.9398560, 72.8355191, "heritage", "A historic railway terminus and UNESCO World Heritage property in central Mumbai.", 45, 2, "Major heritage building and transport landmark.", MUMBAI_SOURCE),
        _place("mumbai", "elephanta-caves", "Elephanta Caves", 18.9628995, 72.9314800, "heritage", "Rock-cut cave temples on Elephanta Island, reached from Mumbai by ferry.", 150, 3, "Distinctive UNESCO-listed heritage site, with substantial access time.", "https://culture.gov.in/elephanta-caves", access="Ferry access is required; the road-routing provider must not be used to claim a direct island route or precise travel time."),
        _place("mumbai", "marine-drive", "Marine Drive", 18.9557281, 72.8127131, "viewpoint", "A coastal boulevard and promenade along Mumbai's Back Bay.", 45, 4, "Central waterfront promenade suited to a short outdoor stop.", MUMBAI_SOURCE),
        _place("mumbai", "cs-museum", "Chhatrapati Shivaji Maharaj Vastu Sangrahalaya", 18.9269268, 72.8326498, "museum", "A museum in the Kala Ghoda area with collections of Indian art and history.", 90, 5, "Established museum with a substantial indoor collection.", MUMBAI_SOURCE),
        _place("mumbai", "haji-ali", "Haji Ali Dargah", 18.9828229, 72.8089926, "heritage", "A mosque and dargah on an islet off Worli, connected to the shore by a causeway.", 60, 6, "Recognised religious and architectural landmark; access can depend on tide and conditions.", MUMBAI_SOURCE),
        _place("mumbai", "siddhivinayak", "Siddhivinayak Temple", 19.0169200, 72.8304090, "heritage", "A Hindu temple dedicated to Ganesha in Prabhadevi.", 45, 7, "Official city tourism source identifies it as a major historic shrine.", "https://mumbaicity.gov.in/en/tourist-place/siddhivinayak-temple/"),
        _place("mumbai", "bhau-daji-lad", "Dr. Bhau Daji Lad Museum", 18.9791016, 72.8347935, "museum", "A museum of Mumbai's history, art and design in Byculla.", 90, 8, "Specialist museum with a focused indoor visit.", "https://www.bdlmuseum.org/"),
        _place("mumbai", "kanheri-caves", "Kanheri Caves", 19.2110497, 72.8928553, "heritage", "Ancient Buddhist rock-cut caves in Sanjay Gandhi National Park.", 120, 9, "Important archaeological site, but distant from the city centre.", MUMBAI_SOURCE),
        _place("mumbai", "hanging-gardens", "Hanging Gardens", 18.9566917, 72.8049037, "park", "Terraced gardens on Malabar Hill overlooking parts of Mumbai.", 45, 10, "Central public garden and viewpoint.", MUMBAI_SOURCE),
        _place("mumbai", "juhu-beach", "Juhu Beach", 19.1026521, 72.8246792, "viewpoint", "A broad Arabian Sea beach on Mumbai's western shore.", 60, 11, "Well-known coastal open space, outside the historic core.", "https://mumbaicity.gov.in/en/tourism/places-of-interest/"),
        _place("mumbai", "bandra-fort", "Bandra Fort", 19.0418641, 72.8183782, "heritage", "A historic fortification at Land's End in Bandra overlooking the sea.", 45, 12, "Compact heritage stop with a coastal setting.", MUMBAI_SOURCE),
    ],
    "bengaluru": [
        _place("bengaluru", "lalbagh", "Lalbagh Botanical Garden", 12.9465345, 77.5800377, "park", "A historic botanical garden with extensive tropical and subtropical plant collections.", 90, 1, "Signature Bengaluru garden and a substantial outdoor visit.", BENGALURU_SOURCE),
        _place("bengaluru", "cubbon-park", "Cubbon Park", 12.9742535, 77.5921906, "park", "A large central urban park with mature trees, paths and civic buildings.", 60, 2, "Central green space documented by Bengaluru and Karnataka tourism sources.", "https://karnatakatourism.org/en/attractions/cubbon-park/"),
        _place("bengaluru", "bangalore-palace", "Bangalore Palace", 12.9985954, 77.5920086, "heritage", "A palace complex with Tudor-inspired architecture, historic interiors and grounds.", 90, 3, "Major architectural and cultural landmark.", BENGALURU_SOURCE),
        _place("bengaluru", "vidhana-soudha", "Vidhana Soudha", 12.9772093, 77.5900021, "heritage", "A monumental granite building that houses Karnataka's legislature and secretariat.", 30, 4, "Architectural landmark visible from public surroundings; interior access is not promised.", BENGALURU_SOURCE, access="Architectural landmark; do not assume interior visitor access without current verification."),
        _place("bengaluru", "tipu-summer-palace", "Tipu Sultan's Summer Palace", 12.9591620, 77.5738240, "heritage", "An ornate two-storey palace associated with Tipu Sultan's summer retreat.", 60, 5, "Documented heritage palace and museum visit.", BENGALURU_SOURCE),
        _place("bengaluru", "bangalore-fort", "Bangalore Fort", 12.9629408, 77.5757599, "heritage", "A surviving historic fortification in the old city area.", 45, 6, "Compact heritage site near the old city market.", BENGALURU_SOURCE),
        _place("bengaluru", "freedom-park", "Freedom Park", 12.9774757, 77.5821562, "park", "A public park developed on the former Central Jail site, with civic and cultural spaces.", 45, 7, "Central public park with documented historic reuse.", "https://karnatakatourism.org/en/attractions/freedom-park/"),
        _place("bengaluru", "visvesvaraya-museum", "Visvesvaraya Industrial and Technological Museum", 12.9752028, 77.5964268, "museum", "A science and technology museum on Kasturba Road.", 90, 8, "Established indoor science museum in the central museum district.", "https://www.vismuseum.gov.in/"),
        _place("bengaluru", "ngma-bengaluru", "National Gallery of Modern Art", 12.9895186, 77.5881044, "museum", "A national gallery presenting modern and contemporary Indian art.", 90, 9, "Established public art museum with a focused collection visit.", "https://ngmaindia.gov.in/"),
        _place("bengaluru", "government-aquarium", "Government Aquarium", 12.9763789, 77.5985775, "attraction", "An aquarium in the Cubbon Park area displaying freshwater and ornamental fish.", 45, 10, "Named civic attraction documented by Bengaluru tourism.", BENGALURU_SOURCE),
        _place("bengaluru", "map-bengaluru", "Museum of Art and Photography", 12.9744743, 77.5968712, "museum", "A museum presenting art, photography and visual culture in central Bengaluru.", 90, 11, "Established specialist museum in the central cultural district.", "https://map-india.org/"),
        _place("bengaluru", "ulsoor-lake", "Ulsoor Lake", 12.9823891, 77.6191669, "park", "A historic urban lake in east-central Bengaluru.", 45, 12, "Central outdoor waterfront stop; conditions and access can vary.", BENGALURU_SOURCE),
    ],
}


def curated_attractions(city_id: str) -> list[dict]:
    return deepcopy(CATALOG.get(city_id, []))
