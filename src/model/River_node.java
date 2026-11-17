package model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public abstract class River_node {
    private String id;
    private String name;
    private String region;
    private List<River_node> upstream = new ArrayList<>();
    private List<River_node> downstream = new ArrayList<>();

    public River_node(String id, String name, String region) {
        this.id = id;
        this.name = name;
        this.region = region;
    }

    public String get_id() { return id; }
    public String get_name() { return name; }
    public String get_region() { return region; }
    public List<River_node> get_upstream() { return Collections.unmodifiableList(upstream); }
    public List<River_node> get_downstream() { return Collections.unmodifiableList(downstream); }

    public void connect_to(River_node next) {
        if (!downstream.contains(next)) {
            downstream.add(next);
            next.upstream.add(this);
        }
    }

    public abstract String describe();
    public abstract double get_risk_weight();
}
