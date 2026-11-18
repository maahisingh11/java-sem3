package model;

import java.time.LocalDateTime;
// each subclass of reading must provide the body for the methods and comparable used for natural sorting , we have used an abstract class because we want a shared template of sorts 
public abstract class Reading implements Comparable<Reading> {
    protected final Pollutant pollutant;

    public Reading(Pollutant pollutant) {
        if (pollutant == null) {
            throw new IllegalArgumentException("Pollutant cannot be null.");
        }
        // exception handling
        this.pollutant = pollutant;
    }

    public Pollutant get_pollutant() {
        return pollutant;
    }

    public abstract double get_value();

    public abstract double get_min_value();

    public abstract double get_max_value();

    public abstract String get_time_label();

    public abstract LocalDateTime get_effective_time();

    public abstract boolean is_annual();

    public abstract String get_source();

    public abstract double get_ratio();

    public abstract Severity get_severity();
  // part of inheritance 
    @Override
    public int compareTo(Reading other) {
        return get_effective_time().compareTo(other.get_effective_time());
    }
}
