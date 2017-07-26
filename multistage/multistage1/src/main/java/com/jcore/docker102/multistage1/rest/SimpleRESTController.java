package com.jcore.docker102.multistage1.rest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController("/")
public class SimpleRESTController {

    @GetMapping
    public String sayHello() {
        return "Hello, and sorry for this very boring and uninspiring Spring Boot app";
    }

}
