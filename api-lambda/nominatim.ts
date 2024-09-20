
import createClient from 'openapi-fetch';
import {LocationInput, Coordinates} from './openapi';
import nominatim from '../openapi/nominatim.gen'; // generated from nominatim.json

let nominatimClient = createClient<nominatim.paths>({ 
    baseUrl: 'https://nominatim.openstreetmap.org',
});

export class LocationLookupException extends Error {
    constructor(message: string) {
        super(`failed to lookup location: ${message}`);
    }
}

export interface INominatim {
    lookupLocation(location: LocationInput): Promise<Coordinates>;
}

export class Nominatim implements INominatim {
    async lookupLocation(location: LocationInput): Promise<Coordinates> {
        let {response, data, error} = await nominatimClient.GET('/search', {
            params: {
                query: {
                    format: 'json',
                    city: location.city,
                    state: location.state,
                    country: location.country,
                },
            },
        });
        if (!response.ok) {
            console.error(error);
            throw new LocationLookupException(response.statusText);
        }
    
        let latitude = data?.at(0)?.lat;
        let longitude = data?.at(0)?.lon;
    
        if (latitude == null || longitude == null) {
            throw new LocationLookupException("no results");
        }
    
        return {
            latitude: Number.parseFloat(latitude),
            longitude: Number.parseFloat(longitude),
        };
    }
}